// "Solved today" counters + tiers for the Tickets page — one for shared
// tickets (credited to whoever replied and got it validated by their
// partner), one for personal tickets (credited to whoever solved their own).
// Kept separate from tickets.js since this is purely the gamification layer
// on top of the ticket workflow, not the workflow itself.
import { TICKET_SCOPE, TICKET_STATUS, otherAccount } from './tickets.js';

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

// Personal tasks earn XP once, when marked solved — no daily reset. The
// amount scales with the priority you gave the task (its leading Pn tag), so
// a "P1 - urgent" is worth meaningfully more than a "P5 - tiny task".
// Reopening a solved task reverses the same amount (see HomeTasks), so it
// can't be farmed by toggling.
export const TASK_XP_BY_PRIORITY = { P5: 5, P4: 10, P3: 15, P2: 25, P1: 40 };

export function taskXpForPriority(priority) {
  const tag = String(priority || '').trim().slice(0, 2).toUpperCase();
  return TASK_XP_BY_PRIORITY[tag] ?? TASK_XP_BY_PRIORITY.P4;
}

// A solved personal task still nudges the Plant's Water meter a little, the
// way the old personal daily tasks did — a small fixed bump rather than a
// position-scaled one, since tasks come and go individually now.
export const TASK_FACTOR = 'water';
export const TASK_FACTOR_GAIN = 4;

// Lifetime count of personal tasks this person has completed — drives the
// "tasks done" badge on the Home hero. Derived from the ticket list, so
// deleting a solved task also drops it from the count.
export function countPersonalSolvedTotal(tickets, user) {
  return tickets.filter(
    (t) => t.scope === TICKET_SCOPE.PERSONAL && t.createdBy === user && t.status === TICKET_STATUS.HANDLED
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
