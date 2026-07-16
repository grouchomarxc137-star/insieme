// Ported from personal/lovissimi's server/nest/stateMachine.js — the emotion
// cycle logic itself is unchanged (ack -> feedback -> reassurance ->
// sufficiency -> agreement -> resolved/still_open), only imports moved.
import * as repo from './resetRoomRepo.js';
import { SESSION_STATUS, EMOTION_STATUS, SUFFICIENCY, ROLES, MAX_REASSURANCE_ATTEMPTS, DEFAULT_NAMES } from './resetRoomConstants.js';

class ActionError extends Error {}

function requireSession(sessionId) {
  const session = repo.getSession(sessionId);
  if (!session) throw new ActionError('Session not found');
  return session;
}

function requireRole(role, expected) {
  if (role !== expected) throw new ActionError(`Only the ${expected} can do that`);
}

function currentEmotion(session) {
  const emotions = repo.listEmotions(session.id);
  return emotions[session.current_emotion_index] || null;
}

function requireCurrentEmotion(session, emotionId, expectedStatus) {
  const emotion = currentEmotion(session);
  if (!emotion || emotion.id !== emotionId) {
    throw new ActionError('That emotion is not currently active');
  }
  if (emotion.status !== expectedStatus) {
    throw new ActionError(`This step is not available right now (emotion status: ${emotion.status})`);
  }
  return emotion;
}

function advanceIfComplete(session) {
  const emotions = repo.listEmotions(session.id);
  const nextIndex = session.current_emotion_index + 1;
  if (nextIndex < emotions.length) {
    repo.setCurrentEmotionIndex(session.id, nextIndex);
  } else {
    repo.setSessionStatus(session.id, SESSION_STATUS.COMPLETED);
  }
}

export function claimRole(sessionId, role, name) {
  const session = requireSession(sessionId);
  if (role !== ROLES.INITIATOR && role !== ROLES.RESPONDER) {
    throw new ActionError('Invalid role');
  }
  const tokenCol = role === ROLES.INITIATOR ? 'initiator_token' : 'responder_token';
  if (session[tokenCol]) {
    throw new ActionError('That role has already been claimed');
  }
  const trimmedName = (name || '').trim().slice(0, 40) || null;
  const token = repo.claimRole(sessionId, role, trimmedName);
  const updated = repo.getSession(sessionId);
  if (updated.initiator_token && updated.responder_token && updated.status === SESSION_STATUS.SETUP) {
    repo.setSessionStatus(sessionId, SESSION_STATUS.ENTRY);
  }
  return token;
}

export function addEmotion(sessionId, role, { text, context, intensity }) {
  const session = requireSession(sessionId);
  requireRole(role, ROLES.INITIATOR);
  if (session.status !== SESSION_STATUS.ENTRY) {
    throw new ActionError('Emotions can only be added during the entry phase');
  }
  const trimmed = (text || '').trim();
  if (!trimmed) throw new ActionError('Feeling text is required');
  repo.addEmotion(sessionId, { text: trimmed, context: (context || '').trim(), intensity });
}

export function lockEntry(sessionId, role) {
  const session = requireSession(sessionId);
  requireRole(role, ROLES.INITIATOR);
  if (session.status !== SESSION_STATUS.ENTRY) {
    throw new ActionError('Entry phase already locked');
  }
  const emotions = repo.listEmotions(sessionId);
  if (emotions.length === 0) {
    throw new ActionError('Add at least one emotion before continuing');
  }
  repo.setCurrentEmotionIndex(sessionId, 0);
  repo.setSessionStatus(sessionId, SESSION_STATUS.PROCESSING);
}

export function submitAcknowledgment(sessionId, role, emotionId, text) {
  const session = requireSession(sessionId);
  requireRole(role, ROLES.RESPONDER);
  if (session.status !== SESSION_STATUS.PROCESSING) throw new ActionError('Session is not in progress');
  const emotion = requireCurrentEmotion(session, emotionId, EMOTION_STATUS.AWAITING_ACK);
  const trimmed = (text || '').trim();
  if (!trimmed) throw new ActionError('Acknowledgment text is required');
  repo.addAcknowledgment(emotion.id, trimmed);
  repo.setEmotionStatus(emotion.id, EMOTION_STATUS.AWAITING_FEEDBACK);
}

export function submitAckFeedback(sessionId, role, emotionId, accepted, gapNote) {
  const session = requireSession(sessionId);
  requireRole(role, ROLES.INITIATOR);
  if (session.status !== SESSION_STATUS.PROCESSING) throw new ActionError('Session is not in progress');
  const emotion = requireCurrentEmotion(session, emotionId, EMOTION_STATUS.AWAITING_FEEDBACK);
  const ack = repo.latestAcknowledgment(emotion.id);
  if (!ack) throw new ActionError('No acknowledgment to respond to');
  if (!accepted && !(gapNote || '').trim()) {
    throw new ActionError('Let them know what was missing');
  }
  repo.setAcknowledgmentFeedback(ack.id, accepted, (gapNote || '').trim());
  if (accepted) {
    repo.setEmotionStatus(emotion.id, EMOTION_STATUS.AWAITING_REASSURANCE);
  } else {
    repo.setEmotionStatus(emotion.id, EMOTION_STATUS.AWAITING_ACK);
  }
}

export function submitReassurance(sessionId, role, emotionId, { text, skipped }) {
  const session = requireSession(sessionId);
  requireRole(role, ROLES.RESPONDER);
  if (session.status !== SESSION_STATUS.PROCESSING) throw new ActionError('Session is not in progress');
  const emotion = requireCurrentEmotion(session, emotionId, EMOTION_STATUS.AWAITING_REASSURANCE);
  const existingAttempts = repo.listReassurances(emotion.id).length;
  if (existingAttempts >= MAX_REASSURANCE_ATTEMPTS) {
    throw new ActionError('Maximum reassurance attempts reached — mark this still open to continue');
  }
  const trimmed = (text || '').trim();
  if (!skipped && !trimmed) throw new ActionError('Add a reassurance or mark acknowledgment as sufficient');
  repo.addReassurance(emotion.id, { text: skipped ? null : trimmed, skipped: !!skipped });
  if (skipped) {
    repo.setEmotionStatus(emotion.id, EMOTION_STATUS.RESOLVED);
    advanceIfComplete(session);
  } else {
    repo.setEmotionStatus(emotion.id, EMOTION_STATUS.AWAITING_SUFFICIENCY);
  }
}

export function submitSufficiency(sessionId, role, emotionId, { sufficiency, gapNote }) {
  const session = requireSession(sessionId);
  requireRole(role, ROLES.INITIATOR);
  if (session.status !== SESSION_STATUS.PROCESSING) throw new ActionError('Session is not in progress');
  const emotion = requireCurrentEmotion(session, emotionId, EMOTION_STATUS.AWAITING_SUFFICIENCY);
  if (!Object.values(SUFFICIENCY).includes(sufficiency)) throw new ActionError('Invalid rating');
  const reassurance = repo.latestReassurance(emotion.id);
  if (!reassurance) throw new ActionError('No reassurance to rate');

  if (sufficiency !== SUFFICIENCY.SATISFIED && !(gapNote || '').trim()) {
    throw new ActionError('Let them know what was missing');
  }
  repo.setReassuranceSufficiency(reassurance.id, sufficiency, (gapNote || '').trim());

  if (sufficiency === SUFFICIENCY.SATISFIED) {
    repo.setEmotionStatus(emotion.id, EMOTION_STATUS.AWAITING_AGREEMENT);
    return;
  }

  // Loop back to another reassurance attempt. If attempts are exhausted, the
  // emotion still lands on AWAITING_REASSURANCE, but reassuranceMaxReached
  // (derived in decorateState) blocks a further submission and the client
  // instead offers "mark still open" to either user.
  repo.setEmotionStatus(emotion.id, EMOTION_STATUS.AWAITING_REASSURANCE);
}

export function markStillOpen(sessionId, role, emotionId) {
  const session = requireSession(sessionId);
  if (role !== ROLES.INITIATOR && role !== ROLES.RESPONDER) throw new ActionError('Invalid role');
  if (session.status !== SESSION_STATUS.PROCESSING) throw new ActionError('Session is not in progress');
  const emotion = currentEmotion(session);
  if (!emotion || emotion.id !== emotionId) throw new ActionError('That emotion is not currently active');
  if (emotion.status !== EMOTION_STATUS.AWAITING_REASSURANCE) {
    throw new ActionError('This step is not available right now');
  }
  const attemptsUsed = repo.listReassurances(emotion.id).length;
  if (attemptsUsed < MAX_REASSURANCE_ATTEMPTS) {
    throw new ActionError('Reassurance attempts are not exhausted yet');
  }
  repo.setEmotionStatus(emotion.id, EMOTION_STATUS.STILL_OPEN);
  advanceIfComplete(session);
}

export function saveAgreement(sessionId, role, emotionId, text) {
  const session = requireSession(sessionId);
  if (session.status !== SESSION_STATUS.PROCESSING) throw new ActionError('Session is not in progress');
  const emotion = requireCurrentEmotion(session, emotionId, EMOTION_STATUS.AWAITING_AGREEMENT);
  const trimmed = (text || '').trim();
  if (!trimmed) throw new ActionError('Agreement text is required');
  repo.saveAgreement(emotion.id, trimmed);
  repo.setEmotionStatus(emotion.id, EMOTION_STATUS.RESOLVED);
  advanceIfComplete(session);
}

export function skipAgreement(sessionId, role, emotionId) {
  const session = requireSession(sessionId);
  if (session.status !== SESSION_STATUS.PROCESSING) throw new ActionError('Session is not in progress');
  const emotion = requireCurrentEmotion(session, emotionId, EMOTION_STATUS.AWAITING_AGREEMENT);
  repo.setEmotionStatus(emotion.id, EMOTION_STATUS.RESOLVED);
  advanceIfComplete(session);
}

export function cancelSession(sessionId, role) {
  const session = requireSession(sessionId);
  if (role !== ROLES.INITIATOR && role !== ROLES.RESPONDER) throw new ActionError('Invalid role');
  if (session.status === SESSION_STATUS.COMPLETED) throw new ActionError('Session is already finished');
  if (session.status === SESSION_STATUS.CANCELLED) throw new ActionError('Session is already cancelled');
  repo.setSessionStatus(sessionId, SESSION_STATUS.CANCELLED);
}

export function decorateState(fullState) {
  const { session, emotions } = fullState;
  const decoratedEmotions = emotions.map((emotion, index) => {
    const reassuranceAttemptsUsed = emotion.reassurances.length;
    const reassuranceMaxReached =
      emotion.status === EMOTION_STATUS.AWAITING_REASSURANCE &&
      reassuranceAttemptsUsed >= MAX_REASSURANCE_ATTEMPTS &&
      reassuranceAttemptsUsed > 0;
    return {
      ...emotion,
      isCurrent: index === session.current_emotion_index && session.status === SESSION_STATUS.PROCESSING,
      reassuranceAttemptsUsed,
      reassuranceMaxReached,
    };
  });
  const { initiator_token, responder_token, initiator_name, responder_name, ...publicSession } = session;
  return {
    session: {
      ...publicSession,
      initiatorClaimed: !!initiator_token,
      responderClaimed: !!responder_token,
      initiatorName: initiator_name || DEFAULT_NAMES[ROLES.INITIATOR],
      responderName: responder_name || DEFAULT_NAMES[ROLES.RESPONDER],
    },
    emotions: decoratedEmotions,
    progress: {
      current: Math.min(session.current_emotion_index + 1, emotions.length),
      total: emotions.length,
    },
  };
}

export { ActionError };
