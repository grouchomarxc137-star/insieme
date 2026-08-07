// Shared "delete the previous message for this key, then post a new one"
// relay for webhook-posted live messages. Used by /api/discord-message
// (the website's Status/Emergency Mood panels) and by the in-Discord status
// menus (server/resetRoomDiscordBot.js), so a mood change from either
// surface deletes/replaces the same message instead of each surface keeping
// its own, separately-tracked "latest message". In-memory only — a server
// restart forgets the mapping and the old message just stops getting
// cleaned up, same tradeoff this already accepted before the refactor.
const lastMessageIds = new Map();

export async function relayDiscordMessage({ webhookUrl, content, key }) {
  if (key && lastMessageIds.has(key)) {
    const previousId = lastMessageIds.get(key);
    try {
      const deleteResponse = await fetch(`${webhookUrl}/messages/${previousId}`, { method: 'DELETE' });
      console.log(`[discord] delete ${previousId} for key "${key}": ${deleteResponse.status}`);
    } catch (err) {
      console.log(`[discord] delete ${previousId} for key "${key}" failed: ${err.message}`);
    }
    lastMessageIds.delete(key);
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
    lastMessageIds.set(key, message.id);
    console.log(`[discord] posted ${message.id} for key "${key}"`);
    return message.id;
  }
  return null;
}
