import db from './db.js';
import { getPeriodInfo, RATING_QUESTION_ID, PARTICIPANTS } from '../src/lib/checkin.js';

export { PARTICIPANTS };
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

// ---------------------------------------------------------------------------
// Relationship heatmap
// ---------------------------------------------------------------------------

function parseRating(response) {
  const value = Number.parseInt(response?.choice, 10);
  return Number.isInteger(value) && value >= 1 && value <= 5 ? value : null;
}

export function isValidRating(value) {
  return Number.isInteger(value) && value >= 1 && value <= 5;
}

// Whether this person's rating for that day already came from a completed
// check-in, in which case it's locked: a submitted answer was a commitment and
// shouldn't be editable afterwards.
//
// Deliberately per-person-and-per-rating rather than just "the day is
// complete". A day can be complete yet hold no rating — every check-in
// recorded before this question existed is like that — and those days should
// still be fillable, otherwise the whole history before this feature shipped
// would be permanently blank.
export function hasCheckinRating(dateKey, participant) {
  const row = db
    .prepare(`SELECT status, responses FROM checkins WHERE id = ?`)
    .get(`daily-${dateKey}`);
  if (row?.status !== STATUS_COMPLETE) return false;

  try {
    const responses = JSON.parse(row.responses || '{}');
    return parseRating(responses?.[participant]?.[RATING_QUESTION_ID]) !== null;
  } catch {
    return false;
  }
}

// One month of the heatmap, merging the two sources a day can come from:
//   'checkin' — both people submitted that day's daily check-in
//   'manual'  — someone filled the day in by hand afterwards
// Shape: { 'YYYY-MM-DD': { Principe: { rating, source }, ... } }
export function getMonthlyRatings(monthKey) {
  const like = `${monthKey}-%`;
  const days = {};

  const setRating = (dateKey, participant, rating, source) => {
    if (!days[dateKey]) days[dateKey] = {};
    days[dateKey][participant] = { rating, source };
  };

  // `status = 'complete'` is filtered here in SQL rather than in the caller:
  // an unfinished day's answers never leave the server at all, so the
  // "no peeking before you commit" rule can't be lost to a UI mistake.
  const checkinRows = db
    .prepare(
      `SELECT period_key, responses FROM checkins
       WHERE type = 'daily' AND status = ? AND period_key LIKE ?`
    )
    .all(STATUS_COMPLETE, like);

  for (const row of checkinRows) {
    let responses;
    try {
      responses = JSON.parse(row.responses || '{}');
    } catch {
      continue;
    }
    for (const participant of PARTICIPANTS) {
      // Days recorded before this question existed simply have no rating.
      const rating = parseRating(responses?.[participant]?.[RATING_QUESTION_ID]);
      if (rating) setRating(row.period_key, participant, rating, 'checkin');
    }
  }

  // A completed check-in always wins, so the two sources can never contradict
  // each other on screen even if a stale manual row is left behind.
  const manualRows = db
    .prepare(`SELECT date_key, participant, rating FROM day_ratings WHERE date_key LIKE ?`)
    .all(like);

  for (const row of manualRows) {
    if (days[row.date_key]?.[row.participant]) continue;
    if (!isValidRating(row.rating)) continue;
    setRating(row.date_key, row.participant, row.rating, 'manual');
  }

  return days;
}

export function setDayRating(dateKey, participant, rating) {
  db.prepare(
    `INSERT INTO day_ratings (date_key, participant, rating, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(date_key, participant)
     DO UPDATE SET rating = excluded.rating, updated_at = excluded.updated_at`
  ).run(dateKey, participant, rating, new Date().toISOString());
}

export function clearDayRating(dateKey, participant) {
  db.prepare(`DELETE FROM day_ratings WHERE date_key = ? AND participant = ?`).run(dateKey, participant);
}

// ---------------------------------------------------------------------------
// Recurring report dedup
// ---------------------------------------------------------------------------

export function wasReportSent(id) {
  return Boolean(db.prepare(`SELECT 1 FROM sent_reports WHERE id = ?`).get(id));
}

export function markReportSent(id) {
  db.prepare(`INSERT OR IGNORE INTO sent_reports (id, sent_at) VALUES (?, ?)`).run(id, new Date().toISOString());
}
