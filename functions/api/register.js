const DESTINATION = "vkr151020@gmail.com";
const allowed = {
  student: ["student_name","parent_guardian_name","mobile_number","class","board","area_in_patna","preferred_timing","teacher_fees","subjects_tuition_requirement"],
  tutor: ["tutor_name","mobile_number","qualification","tenth_passing_board_name","teaching_experience","classes_you_can_teach","subjects","preferred_areas_in_patna","available_timing","student_parent_fees","additional_details"]
};
const json = (body, status=200) => new Response(JSON.stringify(body), {status, headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
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
    const now = new Date().toISOString();
    const result = await env.DB.prepare("INSERT INTO registrations (type, payload, created_at) VALUES (?, ?, ?)").bind(type, JSON.stringify(data), now).run();
    const subject = `${type === "student" ? "Student" : "Tutor"} Registration - NAV DRISHTI HOME TUITION`;
    const body = Object.entries(data).map(([k,v]) => `${k.replaceAll('_',' ')}: ${v || '(not provided)'}`).join("\n");
    const mail = await fetch("https://api.resend.com/emails", {method:"POST",headers:{"Authorization":`Bearer ${env.RESEND_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({from:env.RESEND_FROM || "NAV DRISHTI Website <onboarding@resend.dev>",to:[DESTINATION],subject,text:`New ${type} registration\nSubmitted: ${now}\nRecord ID: ${result.meta?.last_row_id || "saved"}\n\n${body}`})});
    if (!mail.ok) return json({ok:true, warning:"Registration saved, but email delivery failed. Please check Resend setup."}, 200);
    return json({ok:true});
  } catch (e) { return json({error:"Could not save registration. Please try again."}, 500); }
}
