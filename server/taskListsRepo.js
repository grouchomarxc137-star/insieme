import db from './db.js';
import { configForListKey, periodKey, resolveRollover } from '../src/lib/tasksModel.js';
import { penalize } from './growthRepo.js';

// List keys are the same strings the client used as localStorage keys (e.g.
// "lovissimi-personal-Principe"), so the move to the server didn't need a
// rename — just a slug check so arbitrary junk can't become a row.
const KEY_PATTERN = /^[\w-]{1,80}$/;

export function isValidKey(key) {
  return KEY_PATTERN.test(key);
}

function loadRow(key) {
  const row = db.prepare(`SELECT state, updated_at FROM task_lists WHERE key = ?`).get(key);
  if (!row) return null;
  return { state: JSON.parse(row.state), updatedAt: row.updated_at };
}

function persist(key, state) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO task_lists (key, state, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`
  ).run(key, JSON.stringify(state), now);
  return now;
}

// Applies the day/month rollover check (see tasksModel.resolveRollover)
// before this row is used — so a list that's been sitting locked past its
// period always resolves, penalizing anything left unfinished and unlocking
// it for the new period, before the caller (a read or a write) sees it.
function withRolloverApplied(key, row) {
  if (!row) return row;
  const { state: next, penaltyXp } = resolveRollover(row.state, configForListKey(key));
  if (next === row.state) return row;
  const updatedAt = persist(key, next);
  if (penaltyXp > 0) penalize(penaltyXp);
  return { state: next, updatedAt };
}

export function getList(key) {
  const row = withRolloverApplied(key, loadRow(key));
  if (!row) return { exists: false, state: null, updatedAt: null };
  return { exists: true, state: row.state, updatedAt: row.updatedAt };
}

// Whole-list replace (last write wins) — with two known users editing their
// own lists this is plenty, and it keeps the client a straight port of the
// old localStorage flow. Task fields are coerced so a bad payload can't
// store shapes the UI would choke on.
//
// lockedPeriodKey and each task's `missed` flag are server-owned, not
// client-editable: a fresh lock-in (locked flips false → true) stamps the
// current period and clears old `missed` markers — that's the one moment a
// new commitment is made, so it's the one moment the old warnings clear.
// Any other write while already locked (e.g. toggling a task done) just
// carries the existing lockedPeriodKey and missed flags forward untouched.
export function saveList(key, incoming) {
  if (!incoming || !Array.isArray(incoming.tasks)) {
    return { error: 'state.tasks must be an array.' };
  }

  // Resolves any rollover against what's actually stored before this write
  // lands on top of it — otherwise a save arriving the same instant the
  // period turns over could skip the miss penalty.
  const existingRow = withRolloverApplied(key, loadRow(key));
  const wasLocked = Boolean(existingRow?.state?.locked);
  const config = configForListKey(key);
  const isFreshLock = Boolean(incoming.locked) && !wasLocked;

  const clean = {
    tasks: incoming.tasks.map((task) => ({
      id: String(task?.id ?? ''),
      label: String(task?.label ?? ''),
      due: String(task?.due ?? ''),
      done: Boolean(task?.done),
      missed: isFreshLock ? false : Boolean(task?.missed),
    })),
    locked: Boolean(incoming.locked),
    lockedPeriodKey: incoming.locked
      ? isFreshLock
        ? periodKey(config.period)
        : existingRow?.state?.lockedPeriodKey || periodKey(config.period)
      : null,
  };

  const updatedAt = persist(key, clean);
  return { state: clean, updatedAt };
}
