// Shared "delete the previous message for this key, then post a new one"
// relay for webhook-posted live messages. Used by /api/discord-message
// (the website's Status/Emergency Mood panels) and by the in-Discord status
// menus (server/resetRoomDiscordBot.js), so a mood change from either
// surface deletes/replaces the same message instead of each surface keeping
// its own, separately-tracked "latest message".
//
// The key -> message id mapping lives in SQLite (see db.js), not in an
// in-memory Map: a Map forgets everything on a server restart (which `node
// --watch` triggers on every save in dev, and any prod crash/redeploy does
// too), so the very next update for a key would find no tracked message,
// skip the delete, and just post on top of the old one — duplicate
// messages piling up instead of the status message getting replaced.
//
// Calls that share a key are also serialized (see `runQueued` below), so
// two near-simultaneous updates for the same person (e.g. two quick mood
// taps) can't both read "no previous message yet" and both post — a
// check-then-act race that persistence alone doesn't close.
import db from './db.js';

const getMessageId = db.prepare('SELECT message_id FROM discord_relay_messages WHERE key = ?');
const upsertMessageId = db.prepare(
  `INSERT INTO discord_relay_messages (key, message_id, updated_at) VALUES (?, ?, ?)
   ON CONFLICT(key) DO UPDATE SET message_id = excluded.message_id, updated_at = excluded.updated_at`
);
const deleteMessageId = db.prepare('DELETE FROM discord_relay_messages WHERE key = ?');

const keyQueues = new Map();

// Chains calls sharing a key onto the same promise so they run one at a
// time. The queue itself never rejects (failures are swallowed after being
// handed back to the caller), so one failed call can't wedge the next one.
function runQueued(key, task) {
  const previous = keyQueues.get(key) || Promise.resolve();
  const next = previous.then(task);
  keyQueues.set(key, next.catch(() => {}));
  return next;
}

async function relayDiscordMessageNow({ webhookUrl, content, key }) {
  if (key) {
    const row = getMessageId.get(key);
    if (row) {
      try {
        const deleteResponse = await fetch(`${webhookUrl}/messages/${row.message_id}`, { method: 'DELETE' });
        console.log(`[discord] delete ${row.message_id} for key "${key}": ${deleteResponse.status}`);
      } catch (err) {
        console.log(`[discord] delete ${row.message_id} for key "${key}" failed: ${err.message}`);
      }
      deleteMessageId.run(key);
    }
  }

  const response = await fetch(`${webhookUrl}?wait=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!response.ok) {
    throw new Error(`Discord rejected the message: ${response.status} ${await response.text()}`);
  }

  if (key) {
    const message = await response.json();
    upsertMessageId.run(key, message.id, new Date().toISOString());
    console.log(`[discord] posted ${message.id} for key "${key}"`);
    return message.id;
  }
  return null;
}

export function relayDiscordMessage({ webhookUrl, content, key }) {
  if (!key) return relayDiscordMessageNow({ webhookUrl, content, key });
  return runQueued(key, () => relayDiscordMessageNow({ webhookUrl, content, key }));
}
