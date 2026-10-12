-- Run this once against the existing Cloudflare D1 database.
CREATE TABLE IF NOT EXISTS daily_registration_counters (
 registration_date TEXT PRIMARY KEY,
 last_sequence INTEGER NOT NULL CHECK (last_sequence BETWEEN 1 AND 999)
);
