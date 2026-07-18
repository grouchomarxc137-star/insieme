import { useEffect, useState } from 'react';
import { createDefaultState } from './growthModel.js';

// The growth state lives on the server now (see server/growthRepo.js), so
// the tree, character, and quick-log confirmations are the same on every
// device. This module is the API wrapper; all the pure math stays in
// growthModel.js, shared with the server.
export {
  MAX_LEVEL,
  STAGES,
  FACTOR_CONFIG,
  QUICK_LOGS,
  MONTHLY_LOCK_BONUS_XP,
  levelFromXp,
  levelProgress,
  stageForLevel,
  CHARACTER_STAGE_LEVELS,
  CHARACTER_STAGE_COUNT,
  characterStageForLevel,
  currentMultiplier,
  MULTIPLIER_FLOOR,
  MULTIPLIER_SPAN,
} from './growthModel.js';

// The localStorage keys from before the server move — read once, only to
// seed a still-empty server so the XP earned back then isn't lost. The
// server accepts the import only while it has no state of its own, so the
// first device to open the app wins and the other's stale copy is ignored.
const LEGACY_STORAGE_KEY = 'lovissimi-growth';
const LEGACY_QUICK_LOG_PENDING_KEY = 'lovissimi-quicklog-pending';

let legacyImportAttempted = false;

function readLegacyState() {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Number.isFinite(parsed.totalXp)) return null;
    let quickLogPending = {};
    try {
      quickLogPending = JSON.parse(localStorage.getItem(LEGACY_QUICK_LOG_PENDING_KEY) || '{}') || {};
    } catch {
      /* stale pending data isn't worth failing the import over */
    }
    // Only real progress is worth seeding — a clean-slate state (no XP, no
    // meter movement, no pending confirmations) importing first would block
    // the partner's device from importing the state that actually matters.
    const hasProgress =
      parsed.totalXp > 0 ||
      parsed.water > 0 ||
      parsed.sun > 0 ||
      parsed.bees > 0 ||
      parsed.toxicity > 0 ||
      (Number.isFinite(parsed.air) && parsed.air < 100) ||
      Object.values(quickLogPending).some((sides) => sides && Object.keys(sides).length > 0);
    if (!hasProgress) return null;
    return { ...parsed, quickLogPending };
  } catch {
    return null;
  }
}

async function requestGrowth(path, body) {
  const response = await fetch(
    path,
    body === undefined
      ? undefined
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  if (!response.ok) throw new Error(`Growth request failed (${response.status})`);
  return response.json();
}

// Every fresh state fans out to all mounted useGrowth hooks through one
// window event, so an award made on the Home page updates the Plant page's
// meters without each hook re-fetching.
const GROWTH_EVENT = 'lovissimi-growth-updated';

function broadcast(state) {
  window.dispatchEvent(new CustomEvent(GROWTH_EVENT, { detail: state }));
  return state;
}

export async function fetchGrowthState() {
  let state = await requestGrowth('/api/growth');
  if (!state.seeded && !legacyImportAttempted) {
    legacyImportAttempted = true;
    const legacy = readLegacyState();
    if (legacy) {
      try {
        state = await requestGrowth('/api/growth/import', { state: legacy });
      } catch {
        /* another device seeded first — the plain GET state stands */
      }
    }
  }
  return broadcast(state);
}

async function postGrowth(path, body) {
  return broadcast(await requestGrowth(path, body));
}

export function awardGrowth({ xp, factor, factorGain = 0 }) {
  return postGrowth('/api/growth/award', { xp, factor, factorGain });
}

// Mirrors awardGrowth for a task getting unchecked — same xp/factor/factorGain
// it was checked off with, so the credit gets undone instead of just letting
// a re-check re-award on top of it.
export function unawardGrowth({ xp, factor, factorGain = 0 }) {
  return postGrowth('/api/growth/unaward', { xp, factor, factorGain });
}

// The server enforces the once-per-list-per-calendar-month rule, so calling
// this on every lock is safe — it just won't award twice in a month.
export function awardMonthlyLockBonus(logId, taskCount) {
  return postGrowth('/api/growth/monthly-lock', { logId, taskCount });
}

export function confirmQuickLog(user, logId) {
  return postGrowth('/api/growth/quicklog/confirm', { user, logId });
}

export function removeQuickLogConfirmation(logId, side) {
  return postGrowth('/api/growth/quicklog/remove', { logId, side });
}

const POLL_MS = 15000;

function refreshGrowth() {
  fetchGrowthState().catch(() => {
    /* server unreachable, keep showing the last known state */
  });
}

// Live growth state: seeds with defaults so the first render is sane, then
// swaps in the server's state and keeps polling so awards made on the other
// person's device show up within POLL_MS. `loaded` flips once real data is
// in. refresh() forces an immediate re-fetch, though awards already
// broadcast their fresh state on their own.
export function useGrowth() {
  const [state, setState] = useState(() => ({ ...createDefaultState(), loaded: false }));

  useEffect(() => {
    let cancelled = false;

    function handleUpdate(event) {
      if (!cancelled) setState({ ...event.detail, loaded: true });
    }

    window.addEventListener(GROWTH_EVENT, handleUpdate);
    refreshGrowth();
    const interval = setInterval(refreshGrowth, POLL_MS);
    return () => {
      cancelled = true;
      window.removeEventListener(GROWTH_EVENT, handleUpdate);
      clearInterval(interval);
    };
  }, []);

  return { ...state, refresh: refreshGrowth };
}
