export function createPresenceTracker() {
  const sessions = new Map();
  return {
    add(sessionId, role, socketId) {
      if (!sessions.has(sessionId)) sessions.set(sessionId, { initiator: new Set(), responder: new Set() });
      sessions.get(sessionId)[role].add(socketId);
    },
    remove(sessionId, role, socketId) {
      const entry = sessions.get(sessionId);
      if (!entry) return;
      entry[role].delete(socketId);
      if (entry.initiator.size === 0 && entry.responder.size === 0) sessions.delete(sessionId);
    },
    snapshot(sessionId) {
      const entry = sessions.get(sessionId);
      return {
        initiatorConnected: (entry?.initiator.size || 0) > 0,
        responderConnected: (entry?.responder.size || 0) > 0,
      };
    },
    get size() {
      return sessions.size;
    },
  };
}
