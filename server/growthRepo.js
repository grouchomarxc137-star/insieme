import db from './db.js';
import {
  createDefaultState,
  applyDecay,
  applyAward,
  applyPenaltyToState,
  canAwardMonthlyLock,
  clampFactor,
  MONTHLY_LOCK_BONUS_XP,
  QUICK_LOGS,
  FACTOR_CONFIG,
} from '../src/lib/growthModel.js';
import { PARTICIPANTS } from './checkinRepo.js';

// One shared growth state for the couple — a single row, like the plant it
// feeds. "Not seeded yet" (no row) is a real state: it's what makes the
// one-time localStorage import below possible, so getState never writes the
// default row on its own.
function loadRow() {
  const row = db.prepare(`SELECT state FROM growth_state WHERE id = 1`).get();
  if (!row) return { state: null, seeded: false };
  return { state: JSON.parse(row.state), seeded: true };
}

function save(state) {
  db.prepare(
    `INSERT INTO growth_state (id, state, updated_at) VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`
  ).run(JSON.stringify(state), new Date().toISOString());
  return state;
}

// Coerces any stored/imported blob into a full, sane state — numbers finite,
// meters clamped to 0–100 — so a malformed import can't wedge the math.
function normalize(raw) {
  const base = createDefaultState();
  const state = { ...base, ...(raw || {}) };
  state.totalXp = Number.isFinite(state.totalXp) ? Math.max(0, Math.round(state.totalXp)) : 0;
  state.personalXp =
    state.personalXp && typeof state.personalXp === 'object' ? { ...state.personalXp } : { ...base.personalXp };
  for (const p of PARTICIPANTS) {
    state.personalXp[p] = Number.isFinite(state.personalXp[p]) ? Math.max(0, Math.round(state.personalXp[p])) : 0;
  }
  for (const key of Object.keys(FACTOR_CONFIG)) {
    state[key] = Number.isFinite(state[key]) ? clampFactor(state[key]) : base[key];
  }
  if (Number.isNaN(new Date(state.lastUpdate).getTime())) state.lastUpdate = base.lastUpdate;
  state.lastLogged = state.lastLogged && typeof state.lastLogged === 'object' ? { ...state.lastLogged } : {};
  state.quickLogPending =
    state.quickLogPending && typeof state.quickLogPending === 'object' ? { ...state.quickLogPending } : {};
  return state;
}

// Decay is derived (same clamp-at-the-end formula whatever lastUpdate it
// runs from), so reads never write it back — GET /api/growth is polled every
// 15s per open page and shouldn't be a write path. Mutations below persist
// the decayed base along with their own change.
export function getState() {
  const { state, seeded } = loadRow();
  if (!seeded) return { state: normalize(null), seeded: false };
  return { state: applyDecay(normalize(state)), seeded: true };
}

export function award({ xp, factor, factorGain = 0, logId, scope, user }) {
  const { state } = getState();
  return save(applyAward(state, { xp, factor, factorGain, logId, scope, user }));
}

export function penalize({ xp, scope, user }) {
  const { state } = getState();
  return save(applyPenaltyToState(state, xp, { scope, user }));
}

// Undoes an award for a task that got unchecked — same xp/factor/factorGain/
// scope/user the check-off used, just negated through applyAward so the
// factor (and whichever pot got credited) lands back exactly where it
// started. The credited pot won't always net to exactly zero over a
// check+uncheck (this factor's own gain nudges the multiplier the second
// call reads), but a full cycle always starts and ends at the same factor
// value, so repeated toggling can't be used to farm XP.
export function unaward({ xp, factor, factorGain = 0, scope, user }) {
  const { state } = getState();
  const next = applyAward(state, { xp: -xp, factor, factorGain: -factorGain, scope, user });
  if (scope === 'personal' && user) {
    next.personalXp = { ...next.personalXp, [user]: Math.max(0, next.personalXp[user]) };
  } else {
    next.totalXp = Math.max(0, next.totalXp);
  }
  return save(next);
}

// The lock-in bonus for monthly goals — the once-per-list-per-calendar-month
// rule is enforced here, on the shared state, so relocking from a second
// device can't double-award it.
export function monthlyLockBonus(logId, taskCount, { scope, user } = {}) {
  const { state } = getState();
  if (taskCount <= 0 || !canAwardMonthlyLock(state, logId)) {
    return { state, awarded: false };
  }
  const next = applyAward(state, {
    xp: MONTHLY_LOCK_BONUS_XP * taskCount,
    factor: 'bees',
    factorGain: 4,
    logId,
    scope,
    user,
  });
  return { state: save(next), awarded: true };
}

// Records one person's confirmation for a quick-log entry. If the other
// person had already confirmed, this is the completing tap: awards the
// entry's XP, nudges its factor, and resets the pending state so the button
// is immediately ready for the next occurrence.
export function confirmQuickLog(user, logId) {
  const entry = QUICK_LOGS.find((candidate) => candidate.id === logId);
  if (!entry) return { error: `Unknown quick log "${logId}"` };
  if (!PARTICIPANTS.includes(user)) return { error: 'user must be Principe or Principessa.' };

  const { state } = getState();
  const current = state.quickLogPending[logId] || {};
  if (current[user]) return { state, justCompleted: false };

  const next = { ...current, [user]: true };
  const otherUser = user === 'Principe' ? 'Principessa' : 'Principe';

  if (next[otherUser]) {
    const awarded = applyAward(state, { xp: entry.xp, factor: entry.factor, factorGain: entry.factorGain });
    awarded.quickLogPending = { ...state.quickLogPending, [logId]: {} };
    return { state: save(awarded), justCompleted: true };
  }

  const pending = { ...state, quickLogPending: { ...state.quickLogPending, [logId]: next } };
  return { state: save(pending), justCompleted: false };
}

// Undoes a single side's confirmation — for correcting a mis-tap before the
// other person confirms and the XP lands.
export function removeQuickLogConfirmation(logId, side) {
  const { state } = getState();
  const current = state.quickLogPending[logId] || {};
  if (!current[side]) return state;
  const next = { ...current };
  delete next[side];
  return save({ ...state, quickLogPending: { ...state.quickLogPending, [logId]: next } });
}

// One-time migration from the localStorage era: the first device to load the
// app after the server move offers up its local growth state, and it's
// accepted only while no row exists yet — so a second device can't overwrite
// what the first one seeded.
export function importState(raw) {
  const { seeded } = loadRow();
  if (seeded) return { imported: false, ...getState() };
  const state = save(applyDecay(normalize(raw)));
  return { imported: true, state, seeded: true };
}
