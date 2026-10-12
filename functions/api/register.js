const DESTINATION = "vkr151020@gmail.com";
const allowed = {
  student: ["student_name","parent_guardian_name","mobile_number","class","board","area_in_patna","preferred_timing","teacher_fees","subjects_tuition_requirement"],
  tutor: ["tutor_name","mobile_number","qualification","tenth_passing_board_name","teaching_experience","classes_you_can_teach","subjects","preferred_areas_in_patna","available_timing","student_parent_fees","additional_details"]
};
const json = (body, status=200) => new Response(JSON.stringify(body), {status, headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 450 * 1024;
function toBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
export async function onRequestPost({request, env}) {
  try {
    if (!env.DB) return json({error:"Registration system setup incomplete: Cloudflare D1 binding DB is not configured."}, 503);
    if (!env.RESEND_API_KEY) return json({error:"Email service setup incomplete: RESEND_API_KEY secret is not configured."}, 503);
    const form = await request.formData();
    const type = String(form.get("registration_type") || "");
    if (!allowed[type]) return json({error:"Invalid registration type."}, 400);
    const data = {};
    for (const key of allowed[type]) data[key] = String(form.get(key) || "").trim().slice(0, 4000);
    if (!data.mobile_number || !(type === "student" ? data.student_name : data.tutor_name)) return json({error:"Please fill the required fields."}, 400);

    let attachment = null;
    const upload = form.get("rating_screenshot");
    if (upload && typeof upload === "object" && typeof upload.arrayBuffer === "function" && upload.size > 0) {
      if (!IMAGE_TYPES.has(upload.type)) return json({error:"Screenshot JPG, PNG ya WebP image hona chahiye."}, 400);
      if (upload.size > MAX_IMAGE_BYTES) return json({error:"Screenshot compress nahi hua. Kripya chhoti image upload karein (450 KB se kam)."}, 400);
      const bytes = new Uint8Array(await upload.arrayBuffer());
      const content = toBase64(bytes);
      const ext = upload.type === "image/png" ? "png" : upload.type === "image/webp" ? "webp" : "jpg";
      const filename = `rating-screenshot-${type}.${ext}`;
      attachment = {content, contentType:upload.type, filename};
      data.rating_screenshot = attachment;
    }

    const now = new Date().toISOString();
    // Use India-local calendar date so the number resets at midnight in India.
    const indiaParts = new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Kolkata", year:"numeric", month:"2-digit", day:"2-digit"}).formatToParts(new Date());
    const part = key => indiaParts.find(p => p.type === key)?.value || "00";
    const registrationDate = `${part("year")}${part("month")}${part("day")}`; // YYYYMMDD key
    // Atomic UPSERT: Student and Tutor share the same daily sequence; concurrent requests cannot get the same number.
    const counter = await env.DB.prepare(`INSERT INTO daily_registration_counters (registration_date, last_sequence)
      VALUES (?, 1)
      ON CONFLICT(registration_date) DO UPDATE SET last_sequence = last_sequence + 1
      WHERE last_sequence < 999
      RETURNING last_sequence`).bind(registrationDate).all();
    const sequence = counter.results?.[0]?.last_sequence;
    if (!sequence) return json({error:"Aaj ke 999 registrations poore ho chuke hain. Kripya kal dobara try karein."}, 429);
    const registrationNumber = `${registrationDate.slice(2)}${String(sequence).padStart(3, "0")}`; // YYMMDDNNN
    data.registration_number = registrationNumber;
    const result = await env.DB.prepare("INSERT INTO registrations (type, payload, created_at) VALUES (?, ?, ?)").bind(type, JSON.stringify(data), now).run();
    const subject = `${type === "student" ? "Student" : "Tutor"} Registration - ${registrationNumber} - NAV DRISHTI HOME TUITION`;
    const body = Object.entries(data).filter(([k]) => k !== "rating_screenshot").map(([k,v]) => `${k.replaceAll('_',' ')}: ${v || '(not provided)'}`).join("\n");
    const text = `New ${type} registration\nRegistration Number: ${registrationNumber}\nSubmitted: ${now}\nRecord ID: ${result.meta?.last_row_id || "saved"}\nScreenshot attached: ${attachment ? "Yes" : "No"}\n\n${body}`;
    const email = {from:env.RESEND_FROM || "NAV DRISHTI Website <onboarding@resend.dev>",to:[DESTINATION],subject,text};
    if (attachment) email.attachments = [{filename:attachment.filename, content:attachment.content}];
    const mail = await fetch("https://api.resend.com/emails", {method:"POST",headers:{"Authorization":`Bearer ${env.RESEND_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify(email)});
    if (!mail.ok) return json({ok:true, registrationNumber, warning:"Registration saved, but email delivery failed. Please check Resend setup."}, 200);
    return json({ok:true, registrationNumber});
  } catch (e) { return json({error:"Could not save registration. Please try again."}, 500); }
}
