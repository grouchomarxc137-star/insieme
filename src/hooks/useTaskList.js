import { useEffect, useState } from 'react';
import { applyPenalty } from '../lib/growth.js';

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

function loadState(storageKey, defaultTasks) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) return JSON.parse(raw);
  } catch {
    /* corrupt or unavailable storage, fall back to defaults */
  }
  return { tasks: withIds(defaultTasks), locked: false };
}

function saveState(storageKey, state) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    /* storage unavailable, session just won't persist */
  }
}

// rewardForIndex(index) — the XP a task at this position (0-based) is worth;
// escalates the deeper into the list you commit, so a fuller list is worth
// more but also risks more. penaltyRate scales what locking in and not
// finishing costs you, as a fraction of that same reward (1 = lose it all,
// 0.5 = lose half) — the deterrent for over-committing.
export function useTaskList(storageKey, defaultTasks, { rewardForIndex, penaltyRate = 1 }) {
  const [state, setState] = useState(() => loadState(storageKey, defaultTasks));

  useEffect(() => {
    saveState(storageKey, state);
  }, [storageKey, state]);

  function addTask(overrides = {}) {
    setState((prev) => ({
      ...prev,
      tasks: [...prev.tasks, { id: makeId(), label: 'New task', due: '', done: false, ...overrides }],
    }));
  }

  function updateTask(id, patch) {
    setState((prev) => ({
      ...prev,
      tasks: prev.tasks.map((task) => (task.id === id ? { ...task, ...patch } : task)),
    }));
  }

  function removeTask(id) {
    setState((prev) => ({ ...prev, tasks: prev.tasks.filter((task) => task.id !== id) }));
  }

  function toggleTask(id) {
    setState((prev) => ({
      ...prev,
      tasks: prev.tasks.map((task) => (task.id === id ? { ...task, done: !task.done } : task)),
    }));
  }

  function lock() {
    setState((prev) => ({ ...prev, locked: true }));
  }

  // Anything locked in but left unfinished costs you XP here, right before
  // it resets — the whole point of locking in is that it's a real commitment.
  function unlock() {
    setState((prev) => {
      if (prev.locked) {
        prev.tasks.forEach((task, index) => {
          if (!task.done) applyPenalty(Math.round(rewardForIndex(index) * penaltyRate));
        });
      }
      return {
        ...prev,
        locked: false,
        tasks: prev.tasks.map((task) => ({ ...task, done: false })),
      };
    });
  }

  const earned = state.locked
    ? state.tasks.reduce((acc, task, index) => (task.done ? acc + rewardForIndex(index) : acc), 0)
    : 0;

  return {
    tasks: state.tasks,
    locked: state.locked,
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
