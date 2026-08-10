// "Solved today" counters + tiers for the Tickets page — one for shared
// tickets (credited to whoever replied and got it validated by their
// partner), one for personal tickets (credited to whoever solved their own).
// Kept separate from tickets.js since this is purely the gamification layer
// on top of the ticket workflow, not the workflow itself.
import { TICKET_SCOPE, otherAccount } from './tickets.js';

// Scaled for a two-person household's realistic daily volume, not a
// helpdesk queue — 8 solved tickets in a day is already a lot for either
// bucket. Same tier names as the original design, just reachable numbers.
export const TICKET_TIERS = [
  { min: 0, label: 'Start solving', emoji: '' },
  { min: 1, label: 'Bronze', emoji: '🥉' },
  { min: 3, label: 'Silver', emoji: '🥈' },
  { min: 5, label: 'Gold', emoji: '🥇' },
  { min: 8, label: 'On fire', emoji: '🔥' },
];

function isToday(iso) {
  if (!iso) return false;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

// A shared ticket counts as solved the moment its creator validates the
// reply (ticket.validatedAt) — that's the one status backed by the other
// person's confirmation, not just "I replied". Credited to the replier
// (otherAccount(createdBy)), since they're the one who did the solving.
export function countSharedSolvedToday(tickets, user) {
  return tickets.filter(
    (t) => t.scope !== TICKET_SCOPE.PERSONAL && otherAccount(t.createdBy) === user && isToday(t.validatedAt)
  ).length;
}

// A personal ticket counts as solved when its owner marks it done
// (ticket.confirmedAt, set by solve_personal_ticket) — no confirmation step
// to wait on, so this is the only timestamp there is.
export function countPersonalSolvedToday(tickets, user) {
  return tickets.filter(
    (t) => t.scope === TICKET_SCOPE.PERSONAL && t.createdBy === user && isToday(t.confirmedAt)
  ).length;
}

export function tierFor(count) {
  let tier = TICKET_TIERS[0];
  for (const t of TICKET_TIERS) {
    if (count >= t.min) tier = t;
  }
  return tier;
}

export function nextTier(count) {
  return TICKET_TIERS.find((t) => t.min > count) || null;
}
