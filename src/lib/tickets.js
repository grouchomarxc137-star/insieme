// Ported from personal/lovissimi's tickets feature (public/tickets/js +
// server/tickets/constants.js) — same statuses/options, insieme's own design.
export const TICKET_STATUS = {
  RECEIVED: 'Received 💌',
  READING: 'Reading with care 👀',
  DEBUGGING: 'Emotional debugging 🛠️',
  AWAITING: 'Awaiting confirmation 💛',
  VALIDATED: 'Confirmed solved 🌟',
  HANDLED: 'Handled ✅',
};

export const OPEN_STATUSES = [TICKET_STATUS.RECEIVED, TICKET_STATUS.READING, TICKET_STATUS.DEBUGGING];

// Matches insieme's login casing ('Principe'/'Principessa'), not lovissimi's
// lowercase account roles — the ticket's `createdBy` is just the logged-in user.
export const ACCOUNT_ROLES = ['Principe', 'Principessa'];

export const CATEGORY_OPTIONS = [
  'Just expressing',
  'Need reassurance and comforting',
  'Need you present',
  'Need help with this',
  'Need affection and love',
  'Task',
  'Other',
];

// Shared by every ticket regardless of category — the P-number stays the
// urgency scale, the label after it just reads as importance rather than
// something tied specifically to emotional weight.
export const PRIORITY_OPTIONS = [
  'P5 - tiny task',
  'P4 - low priority',
  'P3 - normal priority',
  'P2 - high priority',
  'P1 - urgent',
];

// 'None' is a real, selectable choice — picking it means the reply style
// just doesn't show up on the ticket, see ticketHasReplyStyle below.
export const REPLY_STYLE_OPTIONS = [
  'Soft and sweet',
  'Serious and direct',
  'Funny and cute',
  'Very reassuring',
  'Voice-note energy',
  'None',
];

export function ticketHasReplyStyle(ticket) {
  return Boolean(ticket.replyStyle) && ticket.replyStyle !== 'None';
}

export function otherAccount(role) {
  return role === 'Principe' ? 'Principessa' : 'Principe';
}

// Who needs to act next for a ticket to move forward — used to make that
// obvious at a glance (e.g. a color cue) rather than requiring someone to
// read the status text. Bounces back and forth as the ticket progresses:
// the other person works it, the creator confirms it's solved, then the
// other person closes it. Returns null once handled — there's no one left
// to act on it.
export function ticketWaitingOn(ticket) {
  switch (ticket.status) {
    case TICKET_STATUS.AWAITING:
      return ticket.createdBy;
    case TICKET_STATUS.VALIDATED:
      return otherAccount(ticket.createdBy);
    case TICKET_STATUS.HANDLED:
      return null;
    default: // RECEIVED, READING, DEBUGGING
      return otherAccount(ticket.createdBy);
  }
}
