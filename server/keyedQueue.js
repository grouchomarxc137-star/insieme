// Serialize work for the same key, releasing the tail when the last task
// settles. Older completions must never remove a newer task's queue entry.
export function createKeyedQueue() {
  const tails = new Map();
  return {
    run(key, task) {
      const next = (tails.get(key) || Promise.resolve()).then(task);
      const tail = next.catch(() => {});
      tails.set(key, tail);
      tail.then(() => {
        if (tails.get(key) === tail) tails.delete(key);
      });
      return next;
    },
    get size() {
      return tails.size;
    },
  };
}
