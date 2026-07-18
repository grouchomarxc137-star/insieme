// Shared task-list config: reward formulas, list-key → period/penalty
// mapping, and the day/month-rollover rule. Used by both the client (to show
// reward chips) and the server (server/taskListsRepo.js, to compute the
// penalty when a locked list's period ends), so they can never drift apart.

function pad(n) {
  return String(n).padStart(2, '0');
}

// Local (server-timezone) day/month keys — same Y-M-D convention as
// src/lib/checkin.js's daily period key, just usable standalone for tasks.
export function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

export function periodKey(period, date = new Date()) {
  return period === 'month' ? monthKey(date) : dayKey(date);
}

// Reward escalates by position — the deeper into a list you lock in, the
// more each task is worth, so filling the list out is a bigger commitment
// with a bigger payoff. Monthly goals use a steeper step since they're the
// bigger, rarer efforts (see growthModel.js's Bees comment). Only a task's
// name is player-editable — the reward is always position-driven, never
// chosen.
const DAILY_REWARD_BASE = 10;
const DAILY_REWARD_STEP = 5;
const MONTHLY_REWARD_BASE = 25;
const MONTHLY_REWARD_STEP = 15;

export function dailyReward(index) {
  return DAILY_REWARD_BASE + DAILY_REWARD_STEP * index;
}

export function monthlyReward(index) {
  return MONTHLY_REWARD_BASE + MONTHLY_REWARD_STEP * index;
}

// Locking in a task and not finishing it costs you XP — but only once the
// period it was locked in for actually ends (see resolveRollover below), not
// just for unlocking to revise the list mid-period. Relationship tasks
// depend on someone else showing up too, not just you, so their penalty is
// only half as harsh as everywhere else.
const PENALTY_RATE = 1;
const RELATIONSHIP_PENALTY_RATE = 0.5;

const RELATIONSHIP_KEY = 'lovissimi-relationship-tasks';

// Every list key follows one of three shapes (see HomePage.jsx): per-user
// daily ("lovissimi-personal-<name>"), the one shared daily list, or a
// monthly list (shared or per-user, both prefixed "lovissimi-monthly-").
// Deriving config from the key itself means the server never needs the
// client to separately declare which rules apply to a list it's storing.
export function configForListKey(key) {
  if (key.startsWith('lovissimi-monthly-')) {
    return { period: 'month', rewardForIndex: monthlyReward, penaltyRate: PENALTY_RATE };
  }
  if (key === RELATIONSHIP_KEY) {
    return { period: 'day', rewardForIndex: dailyReward, penaltyRate: RELATIONSHIP_PENALTY_RATE };
  }
  return { period: 'day', rewardForIndex: dailyReward, penaltyRate: PENALTY_RATE };
}

// Pure: given a stored list row and its config, decides whether the period
// it was locked in for has ended. If so, unfinished tasks are marked
// `missed` (a warning the UI keeps showing until the next lock-in) and the
// list unlocks itself for the new period — same reset as a manual unlock,
// just automatic and carrying a penalty for anything left undone. Unlocking
// to edit mid-period is never penalized; only a period actually ending while
// still locked is. A list that's still mid-period, not locked, or was locked
// before this feature existed (no lockedPeriodKey yet — stamped here with no
// penalty rather than guessing how overdue it already is) is returned
// unchanged.
export function resolveRollover(state, config, now = new Date()) {
  if (!state.locked) return { state, penaltyXp: 0 };

  const currentKey = periodKey(config.period, now);
  if (!state.lockedPeriodKey) {
    return { state: { ...state, lockedPeriodKey: currentKey }, penaltyXp: 0 };
  }
  if (state.lockedPeriodKey === currentKey) return { state, penaltyXp: 0 };

  let penaltyXp = 0;
  const tasks = state.tasks.map((task, index) => {
    if (task.done) return { ...task, done: false };
    penaltyXp += Math.round(config.rewardForIndex(index) * config.penaltyRate);
    return { ...task, done: false, missed: true };
  });

  return { state: { ...state, tasks, locked: false, lockedPeriodKey: null }, penaltyXp };
}
