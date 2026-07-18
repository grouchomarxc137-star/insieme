import { useEffect, useState } from 'react';

const POLL_MS = 4000;

// Reads the other person's list from the server (it's read-only here), so
// peeking works from any device — not just a browser that happens to share
// their localStorage. Polls while the peek is open so checkmarks land live.
export function usePeekTasks(storageKey, isActive) {
  const [snapshot, setSnapshot] = useState(null);

  useEffect(() => {
    if (!isActive) {
      setSnapshot(null);
      return undefined;
    }

    let cancelled = false;

    async function readSnapshot() {
      try {
        const response = await fetch(`/api/task-lists/${storageKey}`);
        if (!response.ok) throw new Error(`Peek fetch failed (${response.status})`);
        const { state } = await response.json();
        if (!cancelled) setSnapshot(state || { tasks: [], locked: false });
      } catch {
        /* server unreachable — keep whatever was last shown */
      }
    }

    readSnapshot();
    const interval = setInterval(readSnapshot, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [storageKey, isActive]);

  return snapshot;
}
