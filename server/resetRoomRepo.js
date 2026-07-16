// Ported from personal/lovissimi's server/nest/repo.js, adapted to insieme's
// shared db.js (reset_* table names, same file as checkins).
import { nanoid } from 'nanoid';
import db from './db.js';
import { SESSION_STATUS, EMOTION_STATUS } from './resetRoomConstants.js';

const now = () => new Date().toISOString();

export function createSession() {
  const id = nanoid(10);
  db.prepare(
    `INSERT INTO reset_sessions (id, created_at, status, current_emotion_index)
     VALUES (?, ?, ?, 0)`
  ).run(id, now(), SESSION_STATUS.SETUP);
  return getSession(id);
}

export function getSession(id) {
  return db.prepare(`SELECT * FROM reset_sessions WHERE id = ?`).get(id);
}

export function claimRole(sessionId, role, name) {
  const token = nanoid(24);
  const tokenCol = role === 'initiator' ? 'initiator_token' : 'responder_token';
  const nameCol = role === 'initiator' ? 'initiator_name' : 'responder_name';
  db.prepare(`UPDATE reset_sessions SET ${tokenCol} = ?, ${nameCol} = ? WHERE id = ?`).run(token, name || null, sessionId);
  return token;
}

export function findRoleByToken(session, token) {
  if (!token) return null;
  if (session.initiator_token && session.initiator_token === token) return 'initiator';
  if (session.responder_token && session.responder_token === token) return 'responder';
  return null;
}

export function setSessionStatus(sessionId, status) {
  db.prepare(`UPDATE reset_sessions SET status = ? WHERE id = ?`).run(status, sessionId);
}

export function setCurrentEmotionIndex(sessionId, index) {
  db.prepare(`UPDATE reset_sessions SET current_emotion_index = ? WHERE id = ?`).run(index, sessionId);
}

export function markDiscordNotified(sessionId) {
  db.prepare(`UPDATE reset_sessions SET discord_notified = 1 WHERE id = ?`).run(sessionId);
}

export function addEmotion(sessionId, { text, context, intensity }) {
  const id = nanoid(12);
  const orderIndex = db
    .prepare(`SELECT COALESCE(MAX(order_index), -1) + 1 AS next FROM reset_emotions WHERE session_id = ?`)
    .get(sessionId).next;
  db.prepare(
    `INSERT INTO reset_emotions (id, session_id, order_index, text, context, intensity, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, sessionId, orderIndex, text, context || null, intensity ?? null, EMOTION_STATUS.AWAITING_ACK, now());
  return getEmotion(id);
}

export function getEmotion(id) {
  return db.prepare(`SELECT * FROM reset_emotions WHERE id = ?`).get(id);
}

export function listEmotions(sessionId) {
  return db.prepare(`SELECT * FROM reset_emotions WHERE session_id = ? ORDER BY order_index ASC`).all(sessionId);
}

export function setEmotionStatus(emotionId, status) {
  db.prepare(`UPDATE reset_emotions SET status = ? WHERE id = ?`).run(status, emotionId);
}

export function addAcknowledgment(emotionId, text) {
  const id = nanoid(12);
  const attemptNumber = db
    .prepare(`SELECT COALESCE(MAX(attempt_number), 0) + 1 AS next FROM reset_acknowledgments WHERE emotion_id = ?`)
    .get(emotionId).next;
  db.prepare(
    `INSERT INTO reset_acknowledgments (id, emotion_id, text, accepted, gap_note, attempt_number, created_at)
     VALUES (?, ?, ?, NULL, NULL, ?, ?)`
  ).run(id, emotionId, text, attemptNumber, now());
  return getAcknowledgment(id);
}

export function getAcknowledgment(id) {
  return db.prepare(`SELECT * FROM reset_acknowledgments WHERE id = ?`).get(id);
}

export function listAcknowledgments(emotionId) {
  return db.prepare(`SELECT * FROM reset_acknowledgments WHERE emotion_id = ? ORDER BY attempt_number ASC`).all(emotionId);
}

export function latestAcknowledgment(emotionId) {
  return db
    .prepare(`SELECT * FROM reset_acknowledgments WHERE emotion_id = ? ORDER BY attempt_number DESC LIMIT 1`)
    .get(emotionId);
}

export function setAcknowledgmentFeedback(id, accepted, gapNote) {
  db.prepare(`UPDATE reset_acknowledgments SET accepted = ?, gap_note = ? WHERE id = ?`).run(
    accepted ? 1 : 0,
    gapNote || null,
    id
  );
}

export function addReassurance(emotionId, { text, skipped }) {
  const id = nanoid(12);
  const attemptNumber = db
    .prepare(`SELECT COALESCE(MAX(attempt_number), 0) + 1 AS next FROM reset_reassurances WHERE emotion_id = ?`)
    .get(emotionId).next;
  db.prepare(
    `INSERT INTO reset_reassurances (id, emotion_id, text, skipped, sufficiency, gap_note, attempt_number, created_at)
     VALUES (?, ?, ?, ?, NULL, NULL, ?, ?)`
  ).run(id, emotionId, text || null, skipped ? 1 : 0, attemptNumber, now());
  return getReassurance(id);
}

export function getReassurance(id) {
  return db.prepare(`SELECT * FROM reset_reassurances WHERE id = ?`).get(id);
}

export function listReassurances(emotionId) {
  return db.prepare(`SELECT * FROM reset_reassurances WHERE emotion_id = ? ORDER BY attempt_number ASC`).all(emotionId);
}

export function latestReassurance(emotionId) {
  return db
    .prepare(`SELECT * FROM reset_reassurances WHERE emotion_id = ? ORDER BY attempt_number DESC LIMIT 1`)
    .get(emotionId);
}

export function setReassuranceSufficiency(id, sufficiency, gapNote) {
  db.prepare(`UPDATE reset_reassurances SET sufficiency = ?, gap_note = ? WHERE id = ?`).run(
    sufficiency,
    gapNote || null,
    id
  );
}

export function saveAgreement(emotionId, text) {
  const id = nanoid(12);
  db.prepare(
    `INSERT INTO reset_agreements (id, emotion_id, text, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(emotion_id) DO UPDATE SET text = excluded.text`
  ).run(id, emotionId, text, now());
  return getAgreementForEmotion(emotionId);
}

export function getAgreementForEmotion(emotionId) {
  return db.prepare(`SELECT * FROM reset_agreements WHERE emotion_id = ?`).get(emotionId);
}

export function getFullState(sessionId) {
  const session = getSession(sessionId);
  if (!session) return null;
  const emotions = listEmotions(sessionId).map((emotion) => ({
    ...emotion,
    acknowledgments: listAcknowledgments(emotion.id),
    reassurances: listReassurances(emotion.id),
    agreement: getAgreementForEmotion(emotion.id) || null,
  }));
  return { session, emotions };
}
