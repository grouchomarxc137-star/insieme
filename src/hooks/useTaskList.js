import { useEffect, useState } from 'react';

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

export function useTaskList(storageKey, defaultTasks) {
  const [state, setState] = useState(() => loadState(storageKey, defaultTasks));

  useEffect(() => {
    saveState(storageKey, state);
  }, [storageKey, state]);

  function addTask(overrides = {}) {
    setState((prev) => ({
      ...prev,
      tasks: [
        ...prev.tasks,
        { id: makeId(), label: 'New task', xp: 10, due: '', done: false, ...overrides },
      ],
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

  function unlock() {
    setState((prev) => ({
      ...prev,
      locked: false,
      tasks: prev.tasks.map((task) => ({ ...task, done: false })),
    }));
  }

  const earned = state.locked
    ? state.tasks.reduce((acc, task) => (task.done ? acc + task.xp : acc), 0)
    : 0;

  return {
    tasks: state.tasks,
    locked: state.locked,
    earned,
    addTask,
    updateTask,
    removeTask,
    toggleTask,
    lock,
    unlock,
  };
}
