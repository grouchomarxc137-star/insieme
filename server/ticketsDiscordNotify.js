// Adapted from personal/lovissimi's server/tickets/discordNotify.js — same
// event messages and embed shape, but sent through a webhook (DISCORD_TICKETS_WEBHOOK_URL)
// instead of a bot token + channel, since tickets don't need a bot's permissions.
import { otherAccount } from '../src/lib/tickets.js';

function truncate(str, max) {
  if (!str) return str;
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

const ACTION_MESSAGE = {
  create_ticket: (t) => `💌 ${t.createdBy} sent a ticket to ${otherAccount(t.createdBy)}.`,
  reply_ticket: (t) => `💛 ${otherAccount(t.createdBy)} replied to ${t.createdBy}'s ticket.`,
  validate_ticket: (t) => `🌟 ${t.createdBy} confirmed ${otherAccount(t.createdBy)}'s reply solved it.`,
  reopen_ticket: (t) => `🔁 ${t.createdBy} said the reply didn't fully solve it — reopened.`,
  close_ticket: (t) => `✅ ${otherAccount(t.createdBy)} closed ${t.createdBy}'s ticket.`,
  delete_ticket: (t) => `🗑️ ${t.createdBy}'s ticket was deleted.`,
  update_ticket: (t) => `Ticket status updated to ${t.status}.`,
};

export async function notifyTicketEvent(ticket, action = 'update_ticket') {
  const webhookUrl = process.env.DISCORD_TICKETS_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log('[discord] DISCORD_TICKETS_WEBHOOK_URL not set, skipping ticket notification');
    return;
  }

  const build = ACTION_MESSAGE[action] || ACTION_MESSAGE.update_ticket;
  const embed = {
    title: `#${ticket.id} · ${truncate(ticket.title, 200)}`,
    description: build(ticket),
    color: 0xf5b51b,
    fields: [
      { name: 'Category', value: ticket.category, inline: true },
      { name: 'Priority', value: ticket.priority, inline: true },
      { name: 'Mood', value: `${ticket.mood}/5`, inline: true },
      { name: 'What happened', value: truncate(ticket.message, 1024) || 'Not specified' },
      { name: 'Need', value: truncate(ticket.need, 1024) || 'Not specified' },
      ...(ticket.reply ? [{ name: 'Reply', value: truncate(ticket.reply, 1024) }] : []),
    ],
    timestamp: new Date().toISOString(),
  };

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Discord rejected the ticket notification: ${response.status} ${detail}`);
  }
}
