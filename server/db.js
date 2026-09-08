import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'app.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// One table for both check-in types. `responses` and `submitted_at` are JSON
// objects keyed by participant name (e.g. "Principe"), rather than one column
// per person, so this doesn't need changing if a third type is ever added.
db.exec(`
  CREATE TABLE IF NOT EXISTS checkins (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    period_key TEXT NOT NULL,
    period_label TEXT NOT NULL,
    status TEXT NOT NULL,
    responses TEXT NOT NULL DEFAULT '{}',
    submitted_at TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_checkins_type_period ON checkins(type, period_key);
`);

// Heatmap ratings filled in by hand for days the check-in was forgotten. Kept
// out of `checkins` on purpose: submitAnswers only ever writes the *current*
// period, locks on submit, and fires the comparison PDF — none of which should
// happen when someone backfills last Tuesday. One row per person per day.
db.exec(`
  CREATE TABLE IF NOT EXISTS day_ratings (
    date_key TEXT NOT NULL,
    participant TEXT NOT NULL,
    rating INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (date_key, participant)
  );
`);

// Which recurring reports have already gone out, so a server restart can't
// re-post a month's heatmap. The anniversary reminder gets away with an
// in-memory Map because a duplicate nudge is harmless; a duplicate monthly
// report on every restart for a whole month is not.
db.exec(`
  CREATE TABLE IF NOT EXISTS sent_reports (
    id TEXT PRIMARY KEY,
    sent_at TEXT NOT NULL
  );
`);

// Reset Room — ported from personal/lovissimi's server/nest/db.js. One
// session, many emotions worked through one at a time, each with its own
// acknowledgment/reassurance attempts and an optional final agreement.
db.exec(`
  CREATE TABLE IF NOT EXISTS reset_sessions (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'setup',
    initiator_token TEXT,
    responder_token TEXT,
    initiator_name TEXT,
    responder_name TEXT,
    current_emotion_index INTEGER NOT NULL DEFAULT 0,
    discord_notified INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS reset_emotions (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES reset_sessions(id),
    order_index INTEGER NOT NULL,
    text TEXT NOT NULL,
    context TEXT,
    intensity INTEGER,
    status TEXT NOT NULL DEFAULT 'awaiting_ack',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reset_acknowledgments (
    id TEXT PRIMARY KEY,
    emotion_id TEXT NOT NULL REFERENCES reset_emotions(id),
    text TEXT NOT NULL,
    accepted INTEGER,
    gap_note TEXT,
    attempt_number INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reset_reassurances (
    id TEXT PRIMARY KEY,
    emotion_id TEXT NOT NULL REFERENCES reset_emotions(id),
    text TEXT,
    skipped INTEGER NOT NULL DEFAULT 0,
    sufficiency TEXT,
    gap_note TEXT,
    attempt_number INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reset_agreements (
    id TEXT PRIMARY KEY,
    emotion_id TEXT NOT NULL REFERENCES reset_emotions(id) UNIQUE,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_reset_emotions_session ON reset_emotions(session_id);
  CREATE INDEX IF NOT EXISTS idx_reset_ack_emotion ON reset_acknowledgments(emotion_id);
  CREATE INDEX IF NOT EXISTS idx_reset_reassurance_emotion ON reset_reassurances(emotion_id);
`);

// Tickets — ported from personal/lovissimi's server/tickets/db.js.
db.exec(`
  CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    priority TEXT NOT NULL,
    reply_style TEXT NOT NULL,
    mood INTEGER NOT NULL,
    message TEXT NOT NULL,
    need TEXT DEFAULT '',
    created_by TEXT NOT NULL,
    status TEXT NOT NULL,
    reply TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    replied_at TEXT,
    confirmed_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_tickets_created_by ON tickets(created_by);
`);

// Task lists + the shared growth/XP state — moved out of per-device
// localStorage so both people see the same tasks, tree, and character from
// any device. Stored as JSON blobs in the same shape the client used in
// localStorage (the app only ever reads/writes whole lists, so there's
// nothing to gain from normalizing them into rows).
db.exec(`
  CREATE TABLE IF NOT EXISTS task_lists (
    key TEXT PRIMARY KEY,
    state TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS growth_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    state TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

// Added when the workflow grew a "creator validates the reply" step between
// reply and close — existing DBs won't have this column yet.
const ticketColumns = db.prepare(`PRAGMA table_info(tickets)`).all().map((c) => c.name);
if (!ticketColumns.includes('validated_at')) {
  db.exec(`ALTER TABLE tickets ADD COLUMN validated_at TEXT`);
}
// Tracks the live Discord message for this ticket so updates can edit it in
// place instead of posting a new message each time. Cleared once the ticket
// is closed and moved into the Discord archive thread.
if (!ticketColumns.includes('discord_message_id')) {
  db.exec(`ALTER TABLE tickets ADD COLUMN discord_message_id TEXT`);
}
// 'shared' (the original Principe<->Principessa workflow, Discord-notified)
// or 'personal' (self-assigned, single-click solve, never touches Discord).
// Defaults every existing row to 'shared' so old tickets keep behaving
// exactly as before.
if (!ticketColumns.includes('scope')) {
  db.exec(`ALTER TABLE tickets ADD COLUMN scope TEXT NOT NULL DEFAULT 'shared'`);
}
// Calendar scheduling, added after tickets shipped. `planned_day` is the
// "I mean to do this on <day>" flag set from the Home task list;
// `scheduled_at` is the wall-clock slot it was dropped on in the Calendar
// page ("2026-09-08T14:30", never a UTC instant — see src/lib/schedule.js);
// `duration_min` is the time estimate that decides how tall its block is.
// All three stay null/default on existing rows, so a task nobody has planned
// simply never appears on the calendar.
if (!ticketColumns.includes('planned_day')) {
  db.exec(`ALTER TABLE tickets ADD COLUMN planned_day TEXT`);
}
if (!ticketColumns.includes('scheduled_at')) {
  db.exec(`ALTER TABLE tickets ADD COLUMN scheduled_at TEXT`);
}
if (!ticketColumns.includes('duration_min')) {
  db.exec(`ALTER TABLE tickets ADD COLUMN duration_min INTEGER NOT NULL DEFAULT 30`);
}

// Relationship milestones behind the Moments counters. Used to be a
// hard-coded array in src/lib/moments.js; now editable in the app. The
// original three are seeded on first run (see milestonesRepo.seedDefaults)
// keeping their old string ids, so the Discord anniversary reminder's
// per-milestone dedup keeps working across the switch.
db.exec(`
  CREATE TABLE IF NOT EXISTS milestones (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT '💛',
    date TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    pinned INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
`);

// `pinned` was added after the table shipped — a pinned milestone sorts to
// the front of the Moments page regardless of its date.
const milestoneColumns = db.prepare(`PRAGMA table_info(milestones)`).all().map((c) => c.name);
if (!milestoneColumns.includes('pinned')) {
  db.exec(`ALTER TABLE milestones ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0`);
}

// Backs discordRelay.js's "delete the previous message for this key, then
// post a new one" dedup (used by the website's Status/Emergency Mood panels
// and the in-Discord status buttons). This used to be an in-memory Map,
// which meant a server restart forgot every key and the next update for
// that key skipped the delete and just piled a new message on top of the
// old one instead of replacing it — persisting it here fixes that.
db.exec(`
  CREATE TABLE IF NOT EXISTS discord_relay_messages (
    key TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

export default db;
