import { once } from 'node:events';

// Never contact real Discord during integration tests, even if the developer
// has production credentials in their shell or a local .env file.
for (const key of Object.keys(process.env)) if (key.startsWith('DISCORD_')) delete process.env[key];
Object.assign(process.env, {
  PORT: '0', DOTENV_CONFIG_PATH: '/dev/null', MEMORY_DIAGNOSTICS: '',
  DISCORD_WEBHOOK_URL: 'https://discord.test/status',
  DISCORD_CHECKIN_WEBHOOK_URL: 'https://discord.test/checkins',
  DISCORD_TICKETS_WEBHOOK_URL: 'https://discord.test/tickets',
  DISCORD_BOT_TOKEN: 'test-token', DISCORD_GUILD_ID: 'test-guild',
  DISCORD_CHANNEL_ID: 'reset-channel', DISCORD_TICKETS_CHANNEL_ID: 'tickets-channel',
});
const calls = [];
globalThis.fetch = async (input, options = {}) => {
  const url = String(input);
  if (!/^https:\/\/(?:discord\.test|discord\.com)\//.test(url)) throw new Error('Unexpected external request: ' + url);
  const method = options.method || 'GET';
  const call = { url, method };
  if (options.body instanceof FormData) {
    call.payload = JSON.parse(options.body.get('payload_json'));
    const file = options.body.get('files[0]');
    if (file) {
      const bytes = Buffer.from(await file.arrayBuffer());
      call.attachment = { name: file.name, size: bytes.length, header: bytes.subarray(0, 5).toString() };
    }
  } else if (options.body) call.payload = JSON.parse(options.body);
  calls.push(call);
  if (method === 'DELETE') return new Response(null, { status: 204 });
  if (/\/threads\/(?:active|archived\/public)$/.test(url)) return Response.json({ threads: [] });
  if (/\/threads$/.test(url) && method === 'POST') return Response.json({ id: 'archive-thread' });
  return Response.json({ id: 'message-' + calls.length });
};

const { httpServer } = await import('../../server/index.js');
if (!httpServer.listening) await once(httpServer, 'listening');
process.on('message', (message) => {
  if (message === 'calls') process.send({ type: 'calls', calls });
});
process.send({ type: 'ready', port: httpServer.address().port });
