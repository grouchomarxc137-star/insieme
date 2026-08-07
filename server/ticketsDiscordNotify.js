// Adapted from personal/lovissimi's server/tickets/discordNotify.js — same
// event messages and embed shape, but now:
//   - edits a single message in place (via DISCORD_TICKETS_WEBHOOK_URL) as a
//     ticket moves through its workflow, instead of posting a new message
//     per update, so the channel only ever shows one message per open ticket;
//   - once a ticket is closed, moves it into an auto-managed Discord thread
//     ("🗂️ Ticket Archive") inside the tickets channel — created once via
//     the bot token and reused after — and deletes the live message, so only
//     active tickets remain visible in the channel itself.
//
// The archive requires bot access (DISCORD_BOT_TOKEN, DISCORD_GUILD_ID,
// DISCORD_TICKETS_CHANNEL_ID — the channel DISCORD_TICKETS_WEBHOOK_URL posts
// into) since creating/managing a thread isn't something a webhook can do.
// If those aren't set, closing a ticket just edits the live message in place
// instead of archiving it.
import { otherAccount } from '../src/lib/tickets.js';
import * as ticketsRepo from './ticketsRepo.js';

const DISCORD_API = 'https://discord.com/api/v10';
const ARCHIVE_THREAD_NAME = '🗂️ Ticket Archive';
const GUILD_PUBLIC_THREAD = 11;
const THREAD_ARCHIVED_ERROR_CODE = 50083;

function truncate(str, max) {
  if (!str) return str;
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

const ACTION_MESSAGE = {
  create_ticket: (t) => `💌 ${t.createdBy} sent a ticket to ${otherAccount(t.createdBy)}.`,
  update_status: (t) => `${otherAccount(t.createdBy)} updated the status to ${t.status}.`,
  reply_ticket: (t) => `💛 ${otherAccount(t.createdBy)} replied to ${t.createdBy}'s ticket.`,
  validate_ticket: (t) => `🌟 ${t.createdBy} confirmed ${otherAccount(t.createdBy)}'s reply solved it.`,
  reopen_ticket: (t) => `🔁 ${t.createdBy} said the reply didn't fully solve it — reopened.`,
  close_ticket: (t) => `✅ ${otherAccount(t.createdBy)} closed ${t.createdBy}'s ticket.`,
  delete_ticket: (t) => `🗑️ ${t.createdBy}'s ticket was deleted.`,
  update_ticket: (t) => `Ticket status updated to ${t.status}.`,
};

function buildEmbed(ticket, action) {
  const build = ACTION_MESSAGE[action] || ACTION_MESSAGE.update_ticket;
  return {
    title: `#${ticket.id} · ${truncate(ticket.title, 200)}`,
    description: build(ticket),
    color: 0xf5b51b,
    fields: [
      { name: 'Status', value: ticket.status, inline: true },
      { name: 'Category', value: ticket.category, inline: true },
      { name: 'Priority', value: ticket.priority, inline: true },
      { name: 'Mood', value: `${ticket.mood}/5`, inline: true },
      { name: 'What happened', value: truncate(ticket.message, 1024) || 'Not specified' },
      { name: 'Need', value: truncate(ticket.need, 1024) || 'Not specified' },
      ...(ticket.reply ? [{ name: 'Reply', value: truncate(ticket.reply, 1024) }] : []),
    ],
    footer: { text: `Opened ${ticket.createdAt}` },
    timestamp: new Date().toISOString(),
  };
}

function buildArchiveEmbed(ticket) {
  const embed = buildEmbed(ticket, 'close_ticket');
  embed.color = 0x8a8f98;
  embed.fields.push(
    { name: 'Opened', value: ticket.createdAt, inline: true },
    { name: 'Solved', value: ticket.confirmedAt || ticket.updatedAt, inline: true }
  );
  delete embed.footer;
  return embed;
}

// --- Live message (webhook) -------------------------------------------------

async function postLiveMessage(webhookUrl, embed) {
  const response = await fetch(`${webhookUrl}?wait=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] }),
  });
  if (!response.ok) {
    throw new Error(`Discord rejected the ticket message: ${response.status} ${await response.text()}`);
  }
  const message = await response.json();
  return message.id;
}

async function editLiveMessage(webhookUrl, messageId, embed) {
  return fetch(`${webhookUrl}/messages/${messageId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] }),
  });
}

async function deleteLiveMessage(webhookUrl, messageId) {
  try {
    const response = await fetch(`${webhookUrl}/messages/${messageId}`, { method: 'DELETE' });
    if (!response.ok && response.status !== 404) {
      console.log(`[discord] delete ticket message ${messageId} failed: ${response.status}`);
    }
  } catch (err) {
    console.log(`[discord] delete ticket message ${messageId} failed: ${err.message}`);
  }
}

// Edits the ticket's live message in place, falling back to posting (and
// storing) a new one if there isn't one yet or the old one is gone.
async function upsertLiveMessage(webhookUrl, ticket, action) {
  const embed = buildEmbed(ticket, action);

  if (ticket.discordMessageId) {
    const response = await editLiveMessage(webhookUrl, ticket.discordMessageId, embed);
    if (response.ok) return;
    if (response.status !== 404) {
      throw new Error(`Discord rejected the ticket message edit: ${response.status} ${await response.text()}`);
    }
    // Message was deleted out from under us (manually, or a channel purge) — repost below.
  }

  const messageId = await postLiveMessage(webhookUrl, embed);
  ticketsRepo.setDiscordMessageId(ticket.id, messageId);
}

// --- Archive thread (bot token) ---------------------------------------------

let cachedArchiveThreadId = null;

async function botFetch(path, options = {}) {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  return fetch(`${DISCORD_API}${path}`, {
    ...options,
    headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
}

async function unarchiveThread(threadId) {
  await botFetch(`/channels/${threadId}`, {
    method: 'PATCH',
    body: JSON.stringify({ archived: false, locked: false }),
  });
}

async function findExistingArchiveThread(guildId, channelId) {
  const activeRes = await botFetch(`/guilds/${guildId}/threads/active`);
  if (activeRes.ok) {
    const { threads } = await activeRes.json();
    const match = threads.find((t) => t.parent_id === channelId && t.name === ARCHIVE_THREAD_NAME);
    if (match) return { id: match.id, archived: false };
  }
  const archivedRes = await botFetch(`/channels/${channelId}/threads/archived/public`);
  if (archivedRes.ok) {
    const { threads } = await archivedRes.json();
    const match = threads.find((t) => t.name === ARCHIVE_THREAD_NAME);
    if (match) return { id: match.id, archived: true };
  }
  return null;
}

// Finds the existing "Ticket Archive" thread in the tickets channel, or
// creates it the first time — this is the "if an archive exists, use it,
// else create one" behavior.
async function ensureArchiveThread(guildId, channelId) {
  if (cachedArchiveThreadId) return cachedArchiveThreadId;

  const existing = await findExistingArchiveThread(guildId, channelId);
  if (existing) {
    if (existing.archived) await unarchiveThread(existing.id);
    cachedArchiveThreadId = existing.id;
    return cachedArchiveThreadId;
  }

  const createRes = await botFetch(`/channels/${channelId}/threads`, {
    method: 'POST',
    body: JSON.stringify({ name: ARCHIVE_THREAD_NAME, type: GUILD_PUBLIC_THREAD, auto_archive_duration: 10080 }),
  });
  if (!createRes.ok) {
    throw new Error(`Could not create the ticket archive thread: ${createRes.status} ${await createRes.text()}`);
  }
  const thread = await createRes.json();
  cachedArchiveThreadId = thread.id;
  return cachedArchiveThreadId;
}

// Posts the final ticket record into the archive thread. Returns false (and
// leaves the live message untouched) if the bot isn't configured.
async function postToArchive(ticket) {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  const channelId = process.env.DISCORD_TICKETS_CHANNEL_ID;
  if (!botToken || !guildId || !channelId) {
    console.log(
      '[discord] DISCORD_BOT_TOKEN/DISCORD_GUILD_ID/DISCORD_TICKETS_CHANNEL_ID not set, skipping ticket archive'
    );
    return false;
  }

  const threadId = await ensureArchiveThread(guildId, channelId);
  const embed = buildArchiveEmbed(ticket);
  const send = () => botFetch(`/channels/${threadId}/messages`, { method: 'POST', body: JSON.stringify({ embeds: [embed] }) });

  let response = await send();
  if (!response.ok) {
    const body = await response.clone().json().catch(() => ({}));
    if (body.code === THREAD_ARCHIVED_ERROR_CODE) {
      await unarchiveThread(threadId);
      response = await send();
    }
  }
  if (!response.ok) {
    throw new Error(`Discord rejected the ticket archive message: ${response.status} ${await response.text()}`);
  }
  return true;
}

// --- Entry point -------------------------------------------------------------

export async function notifyTicketEvent(ticket, action = 'update_ticket') {
  const webhookUrl = process.env.DISCORD_TICKETS_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log('[discord] DISCORD_TICKETS_WEBHOOK_URL not set, skipping ticket notification');
    return;
  }

  if (action === 'delete_ticket') {
    if (ticket.discordMessageId) await deleteLiveMessage(webhookUrl, ticket.discordMessageId);
    return;
  }

  if (action === 'close_ticket') {
    const archived = await postToArchive(ticket);
    if (archived && ticket.discordMessageId) {
      await deleteLiveMessage(webhookUrl, ticket.discordMessageId);
      ticketsRepo.clearDiscordMessageId(ticket.id);
      return;
    }
    // Archive isn't configured (or failed) — at least reflect the closed
    // status in place rather than losing the update.
  }

  await upsertLiveMessage(webhookUrl, ticket, action);
}
