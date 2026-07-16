const SESSION_PATH_RE = /^\/reset\/s\/([A-Za-z0-9_-]+)\/?$/;

export function getResetSessionIdFromPath(pathname = window.location.pathname) {
  const match = pathname.match(SESSION_PATH_RE);
  return match ? match[1] : null;
}

export function resetSessionUrl(sessionId) {
  return `${window.location.origin}/reset/s/${sessionId}`;
}
