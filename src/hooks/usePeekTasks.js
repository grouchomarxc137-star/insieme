import { useEffect, useState } from 'react';

export function usePeekTasks(storageKey, isActive) {
  const [snapshot, setSnapshot] = useState(null);

  useEffect(() => {
    if (!isActive) {
      setSnapshot(null);
      return undefined;
    }

    function readSnapshot() {
      try {
        const raw = localStorage.getItem(storageKey);
        setSnapshot(raw ? JSON.parse(raw) : { tasks: [], locked: false });
      } catch {
        setSnapshot({ tasks: [], locked: false });
      }
    }

    readSnapshot();

    function handleStorage(event) {
      if (event.key === storageKey) readSnapshot();
    }

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [storageKey, isActive]);

  return snapshot;
}
