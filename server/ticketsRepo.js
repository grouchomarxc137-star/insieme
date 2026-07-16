// Ported from personal/lovissimi's server/tickets/repo.js, adapted to
// insieme's shared db.js and Principe/Principessa casing.
import db from './db.js';
import { TICKET_STATUS, OPEN_STATUSES, ACCOUNT_ROLES } from '../src/lib/tickets.js';

const now = () => new Date().toISOString();

function clampMood(mood) {
  return Math.min(5, Math.max(1, Number(mood) || 5));
}

function makeTicketId(role) {
  const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `LOVE-${String(role).toUpperCase()}-${stamp}-${random}`;
}

function ticketFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    priority: row.priority,
    replyStyle: row.reply_style,
    mood: row.mood,
    message: row.message,
    need: row.need || '',
    createdBy: row.created_by,
    status: row.status,
    reply: row.reply || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    repliedAt: row.replied_at || '',
    validatedAt: row.validated_at || '',
    confirmedAt: row.confirmed_at || '',
  };
}

export function createTicket({ title, category, priority, replyStyle, mood, message, need, createdBy }) {
  const role = ACCOUNT_ROLES.includes(createdBy) ? createdBy : ACCOUNT_ROLES[0];
  const id = makeTicketId(role);
  const timestamp = now();
  db.prepare(
    `INSERT INTO tickets (id, title, category, priority, reply_style, mood, message, need, created_by, status, reply, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?)`
  ).run(
    id,
    title,
    category || 'Just expressing',
    priority || 'P5 - tiny feeling',
    replyStyle || 'Soft and sweet',
    clampMood(mood),
    message,
    need || '',
    role,
    TICKET_STATUS.RECEIVED,
    timestamp,
    timestamp
  );
  return getTicket(id);
}

export function getTicket(id) {
  return ticketFromRow(db.prepare(`SELECT * FROM tickets WHERE id = ?`).get(id));
}

export function listTickets() {
  return db.prepare(`SELECT * FROM tickets ORDER BY updated_at DESC`).all().map(ticketFromRow);
}

function persist(ticket, changes) {
  const merged = { ...ticket, ...changes };
  db.prepare(
    `UPDATE tickets SET title = ?, category = ?, priority = ?, reply_style = ?, mood = ?, message = ?, need = ?,
       status = ?, reply = ?, updated_at = ?, replied_at = ?, validated_at = ?, confirmed_at = ? WHERE id = ?`
  ).run(
    merged.title,
    merged.category,
    merged.priority,
    merged.replyStyle,
    clampMood(merged.mood),
    merged.message,
    merged.need || '',
    merged.status,
    merged.reply || '',
    merged.updatedAt,
    merged.repliedAt || null,
    merged.validatedAt || null,
    merged.confirmedAt || null,
    ticket.id
  );
  return getTicket(ticket.id);
}

// Workflow: creator submits -> the other person replies (updating status
// along the way) -> the creator validates that the reply solved it (or
// reopens it) -> the other person closes it. Each action below is the only
// actor/status combination allowed to perform that step; with only two
// accounts in this app, "the creator" vs "the other person" is what stands
// in for the four distinct workflow roles.
export function applyTicketAction(id, { actor, action, status, reply }) {
  if (!ACCOUNT_ROLES.includes(actor)) {
    return { error: 'Unknown actor.' };
  }
  const ticket = getTicket(id);
  if (!ticket) {
    return { error: 'Ticket not found.', notFound: true };
  }

  const isCreator = actor === ticket.createdBy;
  const timestamp = now();

  switch (action) {
    case 'update_status': {
      if (isCreator) return { error: 'Only the other person can update the status.' };
      if (!OPEN_STATUSES.includes(ticket.status)) return { error: 'This ticket is no longer open.' };
      if (!OPEN_STATUSES.includes(status)) return { error: 'Invalid status.' };
      return { ticket: persist(ticket, { status, updatedAt: timestamp }) };
    }
    case 'reply_ticket': {
      if (isCreator) return { error: 'Only the other person can reply.' };
      if (!OPEN_STATUSES.includes(ticket.status)) return { error: 'This ticket is no longer open.' };
      if (!reply || !reply.trim()) return { error: 'Write a reply before saving.' };
      return {
        ticket: persist(ticket, {
          reply,
          status: TICKET_STATUS.AWAITING,
          repliedAt: timestamp,
          updatedAt: timestamp,
        }),
      };
    }
    case 'validate_ticket': {
      if (!isCreator) return { error: 'Only the ticket creator can confirm this is solved.' };
      if (ticket.status !== TICKET_STATUS.AWAITING) return { error: 'This ticket is not awaiting your confirmation.' };
      return {
        ticket: persist(ticket, { status: TICKET_STATUS.VALIDATED, validatedAt: timestamp, updatedAt: timestamp }),
      };
    }
    case 'reopen_ticket': {
      if (!isCreator) return { error: 'Only the ticket creator can reopen this.' };
      if (ticket.status !== TICKET_STATUS.AWAITING) return { error: 'This ticket is not awaiting your confirmation.' };
      return { ticket: persist(ticket, { status: TICKET_STATUS.RECEIVED, updatedAt: timestamp }) };
    }
    case 'close_ticket': {
      if (isCreator) return { error: 'Only the other person can close this ticket.' };
      if (ticket.status !== TICKET_STATUS.VALIDATED) return { error: 'This ticket must be confirmed solved before closing.' };
      return {
        ticket: persist(ticket, { status: TICKET_STATUS.HANDLED, confirmedAt: timestamp, updatedAt: timestamp }),
      };
    }
    default:
      return { error: 'Unknown ticket action.' };
  }
}

export function deleteTicket(id) {
  db.prepare(`DELETE FROM tickets WHERE id = ?`).run(id);
}
