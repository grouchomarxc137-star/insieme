import { useEffect, useRef, useState } from 'react';

// Server-backed (see server/taskListsRepo.js) so both people see the same
// lists — and can peek at each other's — from any device. The list key is
// the same string that used to be the localStorage key; a list that has
// never reached the server gets seeded from this device's old localStorage
// copy so nothing typed before the move is lost.
//
// Locking in no longer costs anything to undo mid-period — the deterrent is
// the server's day/month rollover (src/lib/tasksModel.js resolveRollover,
// applied server-side in server/taskListsRepo.js): unlocking here just
// clears `locked` for editing, and the penalty for
// anything left unfinished only lands automatically once the list's period
// actually ends while it's still locked. `missed` flags on tasks come from
// the server the same way, and are shown as a read-only warning here.

const POLL_MS = 4000;
// Local edits within this window also veto applying a fetched state — an
// extra guard on top of dirty/saving for the fetch that was already in
// flight when the edit happened.
const LOCAL_EDIT_GRACE_MS = 3000;
// Typing in a task label mutates state per keystroke; saves coalesce behind
// this debounce so a rename is one PUT, not one per character.
const SAVE_DEBOUNCE_MS = 500;

let idCounter = 0;
function makeId() {
  idCounter += 1;
  return `t${Date.now()}${idCounter}`;
}

function withIds(defaultTasks) {
  return defaultTasks.map((task) => ({
    id: makeId(),
    due: '',
    done: false,
    ...task,
  }));
}

function readLegacyState(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.tasks) && parsed.tasks.length > 0) return parsed;
    }
  } catch {
    /* corrupt or unavailable storage, nothing to migrate */
  }
  return null;
}

async function fetchList(storageKey) {
  const response = await fetch(`/api/task-lists/${storageKey}`);
  if (!response.ok) throw new Error(`Task list fetch failed (${response.status})`);
  return response.json();
}

async function putList(storageKey, state) {
  const response = await fetch(`/api/task-lists/${storageKey}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  });
  if (!response.ok) throw new Error(`Task list save failed (${response.status})`);
  return response.json();
}

// rewardForIndex(index) — the XP a task at this position (0-based) is worth;
// escalates the deeper into the list you commit, so a fuller list is worth
// more but also risks more.
export function useTaskList(storageKey, defaultTasks, { rewardForIndex }) {
  const [state, setState] = useState(null);
  const stateRef = useRef(null);
  stateRef.current = state;
  // dirty = local edits the server hasn't accepted yet; saving = a PUT is in
  // flight. Together they decide who wins when a fetched state arrives:
  // while either is set (or an edit is fresher than the grace window), the
  // local copy does — otherwise a slow PUT could race the 4s poll and a
  // stale fetch would revert what was just typed.
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const lastLocalEditRef = useRef(0);

  async function flushSave() {
    if (savingRef.current || !dirtyRef.current || !stateRef.current) return;
    savingRef.current = true;
    const snapshot = stateRef.current;
    try {
      await putList(storageKey, snapshot);
      // Edits made while the PUT was in flight keep the list dirty, so the
      // next debounce/poll tick saves them too.
      if (stateRef.current === snapshot) dirtyRef.current = false;
    } catch {
      /* still dirty — the poll loop retries the save instead of fetching */
    } finally {
      savingRef.current = false;
    }
  }
  const flushSaveRef = useRef(flushSave);
  flushSaveRef.current = flushSave;

  useEffect(() => {
    let cancelled = false;

    function canApplyServerState() {
      return (
        !cancelled &&
        !dirtyRef.current &&
        !savingRef.current &&
        Date.now() - lastLocalEditRef.current >= LOCAL_EDIT_GRACE_MS
      );
    }

    async function syncFromServer({ seedIfMissing = false } = {}) {
      try {
        const { exists, state: serverState } = await fetchList(storageKey);
        if (cancelled) return;
        if (exists) {
          // Re-checked after the await: an edit may have landed while the
          // fetch was in flight, and it wins over the fetched copy.
          if (canApplyServerState()) setState(serverState);
        } else if (seedIfMissing && !stateRef.current) {
          const legacy = readLegacyState(storageKey);
          setState(legacy || { tasks: withIds(defaultTasks), locked: false });
          if (legacy) {
            dirtyRef.current = true;
            flushSaveRef.current();
          }
        }
      } catch {
        /* server unreachable — the next poll retries */
      }
    }

    syncFromServer({ seedIfMissing: true });
    const interval = setInterval(() => {
      // Unsaved edits take priority: retry the save rather than fetching a
      // state that would overwrite them.
      if (dirtyRef.current) {
        flushSaveRef.current();
        return;
      }
      if (savingRef.current || Date.now() - lastLocalEditRef.current < LOCAL_EDIT_GRACE_MS) return;
      syncFromServer();
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // defaultTasks is a module-level constant at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Debounced save for local edits; dirtyRef stays false when a poll applies
  // the server's own state, so echoes are never re-saved.
  useEffect(() => {
    if (!state || !dirtyRef.current) return undefined;
    const timer = setTimeout(() => flushSaveRef.current(), SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [state]);

  function mutate(updater) {
    lastLocalEditRef.current = Date.now();
    dirtyRef.current = true;
    setState((prev) => updater(prev || { tasks: [], locked: false }));
  }

  function addTask(overrides = {}) {
    mutate((prev) => ({
      ...prev,
      tasks: [...prev.tasks, { id: makeId(), label: 'New task', due: '', done: false, ...overrides }],
    }));
  }

  function updateTask(id, patch) {
    mutate((prev) => ({
      ...prev,
      tasks: prev.tasks.map((task) => (task.id === id ? { ...task, ...patch } : task)),
    }));
  }

  function removeTask(id) {
    mutate((prev) => ({ ...prev, tasks: prev.tasks.filter((task) => task.id !== id) }));
  }

  function toggleTask(id) {
    mutate((prev) => ({
      ...prev,
      tasks: prev.tasks.map((task) => (task.id === id ? { ...task, done: !task.done } : task)),
    }));
  }

  function lock() {
    mutate((prev) => ({ ...prev, locked: true }));
  }

  // Free to do any time — no penalty. The deterrent for over-committing is
  // the server's automatic rollover once the list's period actually ends
  // while still locked, not the act of unlocking to revise it.
  function unlock() {
    mutate((prev) => ({
      ...prev,
      locked: false,
      tasks: prev.tasks.map((task) => ({ ...task, done: false })),
    }));
  }

  const tasks = state?.tasks || [];
  const locked = Boolean(state?.locked);

  const earned = locked
    ? tasks.reduce((acc, task, index) => (task.done ? acc + rewardForIndex(index) : acc), 0)
    : 0;

  return {
    tasks,
    locked,
    loading: state === null,
    earned,
    rewardForIndex,
    addTask,
    updateTask,
    removeTask,
    toggleTask,
    lock,
    unlock,
  };
}
