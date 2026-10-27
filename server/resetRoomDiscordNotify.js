// Completed website Reset Room sessions post a summary and PDF to the
// configured Discord channel using the bot token.
import { buildResetRoomSummaryPdf } from './pdfJobs.js';

const SUFFICIENCY_LABEL = {
  satisfied: 'Satisfied',
  partial: 'Partially satisfied',
  not_needed: 'Not what was needed',
};

function truncate(str, max) {
  if (!str) return str;
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

function summarizeEmotion(emotion) {
  const lines = [];
  const ack = emotion.acknowledgments.find((a) => a.accepted) || emotion.acknowledgments.at(-1);
  if (ack) lines.push(`**Acknowledged:** ${ack.text}`);
  const reassurance = emotion.reassurances.at(-1);
  if (reassurance && !reassurance.skipped) {
    const suffix = reassurance.sufficiency ? ` (${SUFFICIENCY_LABEL[reassurance.sufficiency]})` : '';
    lines.push(`**Reassurance:** ${reassurance.text}${suffix}`);
  }
  if (emotion.agreement) lines.push(`**Agreement:** ${emotion.agreement.text}`);
  return truncate(lines.join('\n') || 'No details recorded.', 1024);
}

export async function notifySessionComplete(fullState) {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const channelId = process.env.DISCORD_CHANNEL_ID;
  if (!botToken || !channelId) {
    console.log('[discord] DISCORD_BOT_TOKEN/DISCORD_CHANNEL_ID not set, skipping reset room notification');
    return;
  }

  const { session, emotions } = fullState;
  const embed = {
    title: `${session.initiatorName} & ${session.responderName} — session complete`,
    description: `${emotions.length} feeling${emotions.length === 1 ? '' : 's'} worked through together.`,
    color: 0x9f7fe0,
    fields: emotions.slice(0, 25).map((emotion, index) => ({
      name: truncate(`${index + 1}. ${emotion.text}${emotion.status === 'still_open' ? ' — still open' : ''}`, 256),
      value: summarizeEmotion(emotion),
    })),
    timestamp: new Date().toISOString(),
  };

  const pdfBuffer = await buildResetRoomSummaryPdf(fullState);

  const form = new FormData();
  form.append('payload_json', JSON.stringify({ embeds: [embed] }));
  form.append('files[0]', new Blob([pdfBuffer], { type: 'application/pdf' }), `reset-room-${session.id}-summary.pdf`);

  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${botToken}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Discord API responded ${res.status}: ${body}`);
  }
}
