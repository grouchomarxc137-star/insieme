// Ported from personal/lovissimi's server/nest/constants.js.
export const SESSION_STATUS = {
  SETUP: 'setup',
  ENTRY: 'entry',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

export const EMOTION_STATUS = {
  AWAITING_ACK: 'awaiting_ack',
  AWAITING_FEEDBACK: 'awaiting_feedback',
  AWAITING_REASSURANCE: 'awaiting_reassurance',
  AWAITING_SUFFICIENCY: 'awaiting_sufficiency',
  AWAITING_AGREEMENT: 'awaiting_agreement',
  RESOLVED: 'resolved',
  STILL_OPEN: 'still_open',
};

export const SUFFICIENCY = {
  SATISFIED: 'satisfied',
  PARTIAL: 'partial',
  NOT_NEEDED: 'not_needed',
};

export const ROLES = {
  INITIATOR: 'initiator',
  RESPONDER: 'responder',
};

export const MAX_REASSURANCE_ATTEMPTS = 3;

export const DEFAULT_NAMES = {
  [ROLES.INITIATOR]: 'Principe',
  [ROLES.RESPONDER]: 'Principessa',
};
