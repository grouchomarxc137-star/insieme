// Pure growth/XP logic shared by the client and the server (which imports
// from src/lib the same way it does moments.js and checkin.js). No storage
// and no React in here — the server's growthRepo persists state to SQLite,
// and src/lib/growth.js wraps the API for components.

// 50 levels = 5 character stages of 10 (the 5th, Principe/Principessa, is the
// true endgame beyond the original 40-level/4-stage design).
export const MAX_LEVEL = 50;

export const STAGES = [
  { id: 'seed', icon: '🌰', label: 'Seed', minLevel: 1, maxLevel: 5 },
  { id: 'sprout', icon: '🌱', label: 'Sprout', minLevel: 6, maxLevel: 10 },
  { id: 'sapling', icon: '🌿', label: 'Sapling', minLevel: 11, maxLevel: 15 },
  { id: 'young-tree', icon: '🌳', label: 'Young Tree', minLevel: 16, maxLevel: 20 },
  { id: 'full-bloom', icon: '🌸', label: 'Full Bloom', minLevel: 21, maxLevel: 25 },
  { id: 'grand-tree', icon: '🌳🌟', label: 'Grand Tree', minLevel: 26, maxLevel: 30 },
  { id: 'ancient-tree', icon: '🌳👑', label: 'Ancient Tree', minLevel: 31, maxLevel: 35 },
  // Runs to MAX_LEVEL, not 40 — the tree has no 9th form, so the final stage
  // covers the whole Principe/Principessa endgame instead of its card
  // claiming "Lv. 36–40" while you're sitting at Lv. 45.
  { id: 'eternal-tree', icon: '✨👑', label: 'Eternal Tree', minLevel: 36, maxLevel: MAX_LEVEL },
];

// water/sun/bees decay on their own because real task data drives them daily.
// air/toxicity don't decay yet — there's no real Tickets/Reset Room feature
// generating the friction they're supposed to track — but they can still be
// nudged manually via the quick-log buttons below.
export const FACTOR_CONFIG = {
  water: { decayPerDay: 6 },
  sun: { decayPerDay: 5 },
  air: { decayPerDay: 0 },
  toxicity: { decayPerDay: 0 },
  bees: { decayPerDay: 3 },
};

// Manual "this happened" buttons for the parts of the system that don't have
// a real feature behind them yet (Check-in, Reset Room, Tickets). Never
// disabled/locked — instead each one needs both Principe and Principessa to
// separately confirm it before the XP actually lands (see
// server/growthRepo.js confirmQuickLog).
export const QUICK_LOGS = [
  {
    id: 'checkin',
    icon: '🗓️',
    label: 'We did a check-in',
    factor: 'bees',
    factorGain: 15,
    xp: 20,
    description: 'Log a real check-in conversation until Check-in is a wired-up feature.',
  },
  {
    id: 'reset_room',
    icon: '🕊️',
    label: 'Reset Room session finished',
    factor: 'toxicity',
    factorGain: -25,
    xp: 20,
    description: 'A real conflict actually got resolved, start to finish — not just opened.',
  },
  {
    id: 'ticket_resolved',
    icon: '🎫',
    label: 'A ticket got resolved',
    factor: 'air',
    factorGain: 15,
    xp: 15,
    description: 'Something that was left unsaid got named and talked through.',
  },
];

// A true clean slate: water/sun/bees rise from actually doing real tasks, so
// they start at 0 — nothing's been built yet. Air/toxicity track friction,
// and no time has passed for any to accumulate, so they start perfect (air
// 100, toxicity 0) rather than pre-loaded with either damage or credit.
// A factory (not a constant) so lastUpdate is stamped when the state is
// actually created, not when this module happened to load.
export function createDefaultState() {
  return {
    totalXp: 0,
    water: 0,
    sun: 0,
    air: 100,
    toxicity: 0,
    bees: 0,
    lastUpdate: new Date().toISOString(),
    lastLogged: {},
    quickLogPending: {},
  };
}

const MS_PER_DAY = 86400000;

// XP required to go from level L to L+1 — grows linearly so later levels
// take noticeably longer. Same per-level constants as the original 40-level
// design (so the first 4 character stages feel exactly as before); the extra
// 10 levels for the Principe/Principessa stage just extend the tail.
function xpForLevel(level) {
  return 60 + (level - 1) * 23;
}

// Total XP to hit MAX_LEVEL is ~30,000. At a near-daily-engagement pace
// (dailies + amortized monthly goals + quick logs, scaled by a realistic
// ~1.2x average multiplier — roughly 100-110 XP/day) that's ~9-9.5 months —
// reaching Tesorino (the old level-40 cap) is still the ~6-month mark.
// Miss days here and there, which is normal, and it runs longer.

function buildThresholds() {
  const thresholds = [0];
  for (let level = 1; level < MAX_LEVEL; level += 1) {
    thresholds.push(thresholds[level - 1] + xpForLevel(level));
  }
  return thresholds; // index i = cumulative XP required to reach level i+1
}

const THRESHOLDS = buildThresholds();

export function levelFromXp(totalXp) {
  let level = 1;
  for (let i = 0; i < THRESHOLDS.length; i += 1) {
    if (totalXp >= THRESHOLDS[i]) level = i + 1;
  }
  return Math.min(level, MAX_LEVEL);
}

export function levelProgress(totalXp) {
  const level = levelFromXp(totalXp);
  const levelStartXp = THRESHOLDS[level - 1];
  const isMax = level >= MAX_LEVEL;
  const xpForNext = isMax ? null : xpForLevel(level);
  const xpIntoLevel = totalXp - levelStartXp;
  return {
    level,
    isMax,
    xpIntoLevel,
    xpForNext,
    progress: isMax ? 1 : Math.min(1, xpIntoLevel / xpForNext),
  };
}

export function stageForLevel(level) {
  return STAGES.find((stage) => level >= stage.minLevel && level <= stage.maxLevel) || STAGES[STAGES.length - 1];
}

// The Character page's human evolution runs off the same level pool as the
// Plant's tree stages, just grouped coarser — 4 stages of 10 levels each
// instead of 8 of 5 — so both progress from one shared XP source.
export const CHARACTER_STAGE_LEVELS = 10;
export const CHARACTER_STAGE_COUNT = MAX_LEVEL / CHARACTER_STAGE_LEVELS;

export function characterStageForLevel(level) {
  return Math.min(CHARACTER_STAGE_COUNT, Math.ceil(level / CHARACTER_STAGE_LEVELS));
}

export function clampFactor(value) {
  return Math.min(100, Math.max(0, value));
}

export const MULTIPLIER_FLOOR = 0.6;
export const MULTIPLIER_SPAN = 0.9;

// The whole point of the elements: growth isn't just "did a task get done",
// it's "how healthy is the relationship state feeding that task" — every XP
// award gets scaled by this, from 0.6x (everything neglected) up to 1.5x
// (everything healthy). Toxicity is inverted since low toxicity is good.
export function currentMultiplier(state) {
  const healthAvg = (state.water + state.sun + state.air + state.bees + (100 - state.toxicity)) / 5;
  return Number((MULTIPLIER_FLOOR + MULTIPLIER_SPAN * (healthAvg / 100)).toFixed(3));
}

// Pure: returns a decayed copy (or the same object when no time has passed).
export function applyDecay(state, now = Date.now()) {
  const elapsedDays = Math.max(0, (now - new Date(state.lastUpdate).getTime()) / MS_PER_DAY);
  if (elapsedDays <= 0) return state;
  const next = { ...state, lastUpdate: new Date(now).toISOString() };
  for (const [key, config] of Object.entries(FACTOR_CONFIG)) {
    if (config.decayPerDay) next[key] = clampFactor(state[key] - config.decayPerDay * elapsedDays);
  }
  return next;
}

// The single transformation every real award goes through — a task checked
// off while locked in, a quick log completing, a monthly lock bonus. xp is
// the nominal reward (what's shown on the task chip); the amount credited to
// totalXp is scaled by the current multiplier. factorGain nudges the
// matching meter (negative gains are valid, e.g. toxicity falling) and is
// never scaled — only the XP conversion rate depends on the elements, not
// the meters themselves. logId, if given, stamps a same-day cooldown (still
// used by the monthly lock-in bonus).
export function applyAward(state, { xp, factor, factorGain = 0, logId }) {
  const multiplier = currentMultiplier(state);
  const next = { ...state, totalXp: state.totalXp + Math.round(xp * multiplier) };
  if (factor) {
    next[factor] = clampFactor(state[factor] + factorGain);
  }
  if (logId) {
    next.lastLogged = { ...state.lastLogged, [logId]: new Date().toISOString() };
  }
  return next;
}

// Locking in a task you don't finish costs you XP instead of just earning
// nothing, so committing to more than you'll actually do has a real cost.
// Flat, unscaled by the multiplier on purpose — the multiplier rewards a
// healthy relationship state, it shouldn't also soften the deterrent for not
// following through. Floors at 0 totalXp rather than going negative.
export function applyPenaltyToState(state, xp) {
  return { ...state, totalXp: Math.max(0, state.totalXp - xp) };
}

// Committing to a monthly goal is worth a little XP on its own, before it's
// even done — but only once per goal-list per calendar month, so it can't
// be farmed by unlocking and relocking the same goals.
export const MONTHLY_LOCK_BONUS_XP = 5;

function isSameMonth(isoA, isoB) {
  return isoA && isoB && isoA.slice(0, 7) === isoB.slice(0, 7);
}

export function canAwardMonthlyLock(state, logId) {
  const last = state.lastLogged?.[logId];
  return !isSameMonth(last, new Date().toISOString());
}
