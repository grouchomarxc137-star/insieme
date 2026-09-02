import { nanoid } from 'nanoid';
import db from './db.js';
import { DEFAULT_MILESTONES } from '../src/lib/moments.js';

const now = () => new Date().toISOString();

function rowToMilestone(row) {
  if (!row) return null;
  return {
    id: row.id,
    label: row.label,
    icon: row.icon,
    date: row.date,
    sortOrder: row.sort_order,
    pinned: row.pinned === 1,
    createdAt: row.created_at,
  };
}

// Seeds the original three milestones the first time the app runs against a
// fresh (or pre-milestones-table) database. Idempotent: once any row exists
// it does nothing, so it's safe to call on every boot.
export function seedDefaults() {
  const count = db.prepare(`SELECT COUNT(*) AS n FROM milestones`).get().n;
  if (count > 0) return;
  const insert = db.prepare(
    `INSERT INTO milestones (id, label, icon, date, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  );
  const timestamp = now();
  DEFAULT_MILESTONES.forEach((m, index) => {
    insert.run(m.id, m.label, m.icon, m.date, index, timestamp);
  });
}

export function listMilestones() {
  return db
    .prepare(`SELECT * FROM milestones ORDER BY pinned DESC, sort_order ASC, created_at ASC`)
    .all()
    .map(rowToMilestone);
}

export function getMilestone(id) {
  return rowToMilestone(db.prepare(`SELECT * FROM milestones WHERE id = ?`).get(id));
}

// Returns { error } on bad input, otherwise the created milestone. `date` is
// stored verbatim as the client sends it (a local datetime string like
// "2026-01-29T18:00") — the same shape the hard-coded array used, which
// new Date() parses as local time.
export function createMilestone({ label, icon, date }) {
  const clean = validate({ label, icon, date });
  if (clean.error) return clean;
  const nextOrder =
    (db.prepare(`SELECT MAX(sort_order) AS m FROM milestones`).get().m ?? -1) + 1;
  const id = nanoid(10);
  db.prepare(
    `INSERT INTO milestones (id, label, icon, date, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, clean.label, clean.icon, clean.date, nextOrder, now());
  return getMilestone(id);
}

export function updateMilestone(id, { label, icon, date, pinned }) {
  const existing = getMilestone(id);
  if (!existing) return { error: 'Milestone not found.', notFound: true };
  const clean = validate({
    label: label ?? existing.label,
    icon: icon ?? existing.icon,
    date: date ?? existing.date,
  });
  if (clean.error) return clean;
  const nextPinned = pinned === undefined ? existing.pinned : Boolean(pinned);
  db.prepare(`UPDATE milestones SET label = ?, icon = ?, date = ?, pinned = ? WHERE id = ?`).run(
    clean.label,
    clean.icon,
    clean.date,
    nextPinned ? 1 : 0,
    id
  );
  return getMilestone(id);
}

export function deleteMilestone(id) {
  const existing = getMilestone(id);
  if (!existing) return { error: 'Milestone not found.', notFound: true };
  db.prepare(`DELETE FROM milestones WHERE id = ?`).run(id);
  return { ok: true };
}

function validate({ label, icon, date }) {
  const cleanLabel = String(label || '').trim();
  const cleanIcon = String(icon || '').trim() || '💛';
  const cleanDate = String(date || '').trim();
  if (!cleanLabel) return { error: 'Give the moment a name.' };
  if (!cleanDate || Number.isNaN(new Date(cleanDate).getTime())) {
    return { error: 'Pick a valid date.' };
  }
  return { label: cleanLabel, icon: cleanIcon, date: cleanDate };
}
