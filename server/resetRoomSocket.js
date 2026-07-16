// Ported from personal/lovissimi's server/nest/socket.js — presence
// tracking + the live event handlers are unchanged, only imports moved.
import * as repo from './resetRoomRepo.js';
import * as sm from './resetRoomStateMachine.js';
import { ROLES, SESSION_STATUS } from './resetRoomConstants.js';
import { notifySessionComplete } from './resetRoomDiscordNotify.js';
import { unlockAfterSession } from './resetRoomDiscordBot.js';

// sessionId -> { initiator: Set<socketId>, responder: Set<socketId> }
const presence = new Map();

function getPresenceEntry(sessionId) {
  if (!presence.has(sessionId)) {
    presence.set(sessionId, { initiator: new Set(), responder: new Set() });
  }
  return presence.get(sessionId);
}

function presenceSnapshot(sessionId) {
  const entry = getPresenceEntry(sessionId);
  return {
    initiatorConnected: entry.initiator.size > 0,
    responderConnected: entry.responder.size > 0,
  };
}

function roomOf(sessionId) {
  return `session:${sessionId}`;
}

function broadcastState(io, sessionId) {
  const fullState = repo.getFullState(sessionId);
  if (!fullState) return;
  io.to(roomOf(sessionId)).emit('session:state', sm.decorateState(fullState));
}

function broadcastPresence(io, sessionId) {
  io.to(roomOf(sessionId)).emit('presence:update', presenceSnapshot(sessionId));
}

function notifyDiscordIfJustCompleted(sessionId) {
  const session = repo.getSession(sessionId);
  if (!session) return;
  if (session.status === SESSION_STATUS.CANCELLED) {
    unlockAfterSession(sessionId);
    return;
  }
  if (session.status !== SESSION_STATUS.COMPLETED || session.discord_notified) return;
  repo.markDiscordNotified(sessionId);
  const fullState = repo.getFullState(sessionId);
  notifySessionComplete(sm.decorateState(fullState)).then(
    () => {
      console.log(`[discord] posted summary for session ${sessionId}`);
      unlockAfterSession(sessionId);
    },
    (err) => console.error(`[discord] failed to post summary for session ${sessionId}:`, err.message)
  );
}

export function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    socket.on('session:join', ({ sessionId, role, token, name }, ack) => {
      try {
        const session = repo.getSession(sessionId);
        if (!session) throw new sm.ActionError('Session not found');

        let resolvedRole = repo.findRoleByToken(session, token);
        let resolvedToken = resolvedRole ? token : null;

        if (!resolvedRole) {
          if (role !== ROLES.INITIATOR && role !== ROLES.RESPONDER) {
            throw new sm.ActionError('Choose a role to join');
          }
          resolvedToken = sm.claimRole(sessionId, role, name);
          resolvedRole = role;
        }

        socket.data.sessionId = sessionId;
        socket.data.role = resolvedRole;
        socket.join(roomOf(sessionId));

        const entry = getPresenceEntry(sessionId);
        entry[resolvedRole].add(socket.id);

        ack?.({ ok: true, role: resolvedRole, token: resolvedToken });
        broadcastState(io, sessionId);
        broadcastPresence(io, sessionId);
      } catch (err) {
        ack?.({ ok: false, message: err.message });
      }
    });

    function handle(action) {
      return (payload = {}, ack) => {
        const { sessionId, role } = socket.data;
        if (!sessionId || !role) {
          ack?.({ ok: false, message: 'Join the session first' });
          return;
        }
        try {
          action(sessionId, role, payload);
          ack?.({ ok: true });
          broadcastState(io, sessionId);
          notifyDiscordIfJustCompleted(sessionId);
        } catch (err) {
          ack?.({ ok: false, message: err.message });
        }
      };
    }

    socket.on(
      'emotion:add',
      handle((sessionId, role, { text, context, intensity }) =>
        sm.addEmotion(sessionId, role, { text, context, intensity })
      )
    );

    socket.on(
      'entry:lock',
      handle((sessionId, role) => sm.lockEntry(sessionId, role))
    );

    socket.on(
      'ack:submit',
      handle((sessionId, role, { emotionId, text }) => sm.submitAcknowledgment(sessionId, role, emotionId, text))
    );

    socket.on(
      'ack:feedback',
      handle((sessionId, role, { emotionId, accepted, gapNote }) =>
        sm.submitAckFeedback(sessionId, role, emotionId, accepted, gapNote)
      )
    );

    socket.on(
      'reassurance:submit',
      handle((sessionId, role, { emotionId, text, skipped }) =>
        sm.submitReassurance(sessionId, role, emotionId, { text, skipped })
      )
    );

    socket.on(
      'sufficiency:submit',
      handle((sessionId, role, { emotionId, sufficiency, gapNote }) =>
        sm.submitSufficiency(sessionId, role, emotionId, { sufficiency, gapNote })
      )
    );

    socket.on(
      'emotion:markStillOpen',
      handle((sessionId, role, { emotionId }) => sm.markStillOpen(sessionId, role, emotionId))
    );

    socket.on(
      'agreement:save',
      handle((sessionId, role, { emotionId, text }) => sm.saveAgreement(sessionId, role, emotionId, text))
    );

    socket.on(
      'agreement:skip',
      handle((sessionId, role, { emotionId }) => sm.skipAgreement(sessionId, role, emotionId))
    );

    socket.on(
      'session:cancel',
      handle((sessionId, role) => sm.cancelSession(sessionId, role))
    );

    socket.on('presence:typing', ({ isTyping }) => {
      const { sessionId, role } = socket.data;
      if (!sessionId || !role) return;
      socket.to(roomOf(sessionId)).emit('presence:typing', { role, isTyping: !!isTyping });
    });

    socket.on('disconnect', () => {
      const { sessionId, role } = socket.data;
      if (!sessionId || !role) return;
      const entry = getPresenceEntry(sessionId);
      entry[role].delete(socket.id);
      broadcastPresence(io, sessionId);
    });
  });
}
