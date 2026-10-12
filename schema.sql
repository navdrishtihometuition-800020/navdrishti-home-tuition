CREATE TABLE IF NOT EXISTS registrations (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 type TEXT NOT NULL CHECK (type IN ('student','tutor')),
 payload TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_registrations_created_at ON registrations(created_at DESC);


-- Daily shared sequence for Student + Tutor registration numbers (India date).
CREATE TABLE IF NOT EXISTS daily_registration_counters (
 registration_date TEXT PRIMARY KEY,
 last_sequence INTEGER NOT NULL CHECK (last_sequence BETWEEN 1 AND 999)
);
