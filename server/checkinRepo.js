import db from './db.js';
import { getPeriodInfo } from '../src/lib/checkin.js';

export const PARTICIPANTS = ['Principe', 'Principessa'];
const STATUS_COMPLETE = 'complete';

function otherParticipant(participant) {
  return participant === 'Principe' ? 'Principessa' : 'Principe';
}

function rowFromDb(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    periodKey: row.period_key,
    periodLabel: row.period_label,
    status: row.status,
    responses: JSON.parse(row.responses || '{}'),
    submittedAt: JSON.parse(row.submitted_at || '{}'),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at || null,
  };
}

// The client-facing shape: hides both participants' answers until the
// status is complete, so "reveal only after both submit" is enforced by the
// API itself, not just by the UI choosing not to show it.
export function toPublicView(checkin) {
  const isComplete = checkin.status === STATUS_COMPLETE;
  return {
    id: checkin.id,
    type: checkin.type,
    periodKey: checkin.periodKey,
    periodLabel: checkin.periodLabel,
    status: checkin.status,
    submittedAt: checkin.submittedAt,
    responses: isComplete ? checkin.responses : null,
  };
}

// Always reflects "now" — never trusts a client-supplied period key, so the
// server's clock is the single source of truth for which day/week is active.
export function getCurrentCheckin(type) {
  const { key, label } = getPeriodInfo(type);
  const id = `${type}-${key}`;
  const existing = rowFromDb(db.prepare(`SELECT * FROM checkins WHERE id = ?`).get(id));
  if (existing) return existing;

  return {
    id,
    type,
    periodKey: key,
    periodLabel: label,
    status: `waiting`,
    responses: {},
    submittedAt: {},
    createdAt: null,
    updatedAt: null,
    completedAt: null,
  };
}

// Merges one participant's answers into the current period's row, creating
// it on first submission. Returns the full (server-side) row, including
// whether this submission just completed the check-in.
export function submitAnswers(type, participant, responses) {
  if (!PARTICIPANTS.includes(participant)) {
    throw new Error(`Unknown participant "${participant}"`);
  }

  const { key, label } = getPeriodInfo(type);
  const id = `${type}-${key}`;
  const now = new Date().toISOString();

  const existing = rowFromDb(db.prepare(`SELECT * FROM checkins WHERE id = ?`).get(id));
  if (existing?.submittedAt?.[participant]) {
    // Locks immediately on submit — you commit to your answer before seeing
    // theirs, matching the trust/no-peeking point of the exercise.
    throw new Error(`${participant} already submitted this period's check-in.`);
  }

  const nextResponses = { ...(existing?.responses || {}), [participant]: responses };
  const nextSubmittedAt = { ...(existing?.submittedAt || {}), [participant]: now };
  const isComplete = PARTICIPANTS.every((name) => nextSubmittedAt[name]);
  const status = isComplete ? STATUS_COMPLETE : `waiting_for_${otherParticipant(participant)}`;
  const completedAt = isComplete ? existing?.completedAt || now : null;

  if (existing) {
    db.prepare(
      `UPDATE checkins SET status = ?, responses = ?, submitted_at = ?, updated_at = ?, completed_at = ? WHERE id = ?`
    ).run(status, JSON.stringify(nextResponses), JSON.stringify(nextSubmittedAt), now, completedAt, id);
  } else {
    db.prepare(
      `INSERT INTO checkins (id, type, period_key, period_label, status, responses, submitted_at, created_at, updated_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, type, key, label, status, JSON.stringify(nextResponses), JSON.stringify(nextSubmittedAt), now, now, completedAt);
  }

  const saved = rowFromDb(db.prepare(`SELECT * FROM checkins WHERE id = ?`).get(id));
  return { checkin: saved, justCompleted: isComplete && !existing?.completedAt };
}
