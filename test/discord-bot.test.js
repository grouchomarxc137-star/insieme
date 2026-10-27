import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import * as discord from 'discord.js';

test('retained Discord commands and website nickname updates work without retired features', async (t) => {
  const previousEnv = { ...process.env };
  Object.assign(process.env, { DISCORD_BOT_TOKEN: 'test-token', DISCORD_CLIENT_ID: 'test-app', DISCORD_GUILD_ID: 'test-guild' });
  delete process.env.DISCORD_CHANNEL_ID;
  delete process.env.PUBLIC_BASE_URL;
  process.env.DISCORD_STATUS_CHANNEL_ID = 'obsolete-setting-must-not-recreate-menus';
  const registrations = [];
  const members = new Map([
    ['1497122888090783904', { nickname: 'Principe 👸🏽💛😩' }],
    ['539848335104802820', { nickname: 'Principessa 🤴🏽💛' }],
  ]);
  for (const member of members.values()) member.setNickname = async (value) => { member.nickname = value; };

  class TestClient extends EventEmitter {
    constructor(options) {
      super();
      this.options = options;
      this.user = { id: 'test-bot', tag: 'test-bot' };
      this.guilds = { fetch: async () => ({ members: { fetch: async (id) => members.get(id) } }) };
      this.channels = { fetch: () => { throw new Error('Unexpected channel-history or menu setup'); } };
    }
    login(token) { this.token = token; return Promise.resolve(); }
    isReady() { return true; }
    destroy() { this.destroyed = true; }
  }
  class TestRest {
    setToken(token) { assert.equal(token, 'test-token'); return this; }
    async put(route, options) { registrations.push({ route, ...options }); }
  }
  const { default: _default, ...namedExports } = discord;
  mock.module('discord.js', { namedExports: { ...namedExports, Client: TestClient, REST: TestRest } });
  const bot = await import('../server/resetRoomDiscordBot.js');
  t.after(async () => {
    await bot.stopDiscordBot();
    mock.restoreAll();
    for (const key of Object.keys(process.env)) if (!(key in previousEnv)) delete process.env[key];
    Object.assign(process.env, previousEnv);
  });
  const client = bot.startDiscordBot();
  assert.equal(client.token, 'test-token', 'bot unnecessarily requires retired Reset Room settings');
  assert.deepEqual(client.options, { intents: [discord.GatewayIntentBits.Guilds] });
  assert.equal(client.listenerCount('messageCreate'), 0);
  await client.rawListeners('clientReady')[0]();

  assert.equal(registrations.length, 1);
  assert.deepEqual(registrations[0].body.map((command) => command.name), ['lovevest', 'define']);
  assert.deepEqual(registrations[0].body[1].options[1].choices.map((choice) => choice.value), ['en', 'it', 'nl', 'pt']);

  await t.test('website status and emergency changes preserve the other nickname half after restart', async () => {
    const member = members.get('1497122888090783904');
    await bot.setEmergencyNickname('Principe', '🌪️');
    assert.equal(member.nickname, 'Principe 👸🏽💛🌪️');
    await bot.setStatusNickname('Principe', '✨');
    assert.equal(member.nickname, 'Principe ✨🌪️');
    await bot.clearEmergencyNickname('Principe');
    assert.equal(member.nickname, 'Principe ✨');
    await bot.setStatusNickname('Principessa', '😴');
    assert.equal(members.get('539848335104802820').nickname, 'Principessa 😴');
  });

  const handler = client.listeners('interactionCreate')[0];
  const interaction = (commandName, extra = {}) => ({
    commandName, guildId: 'test-guild', isChatInputCommand: () => true, ...extra,
  });
  await t.test('/lovevest still acknowledges privately and attaches a real photo', async () => {
    let reply, sent;
    await handler(interaction('lovevest', {
      reply: async (payload) => { reply = payload; },
      channel: { send: async (payload) => { sent = payload; } },
    }));
    assert.equal(reply.flags, discord.MessageFlags.Ephemeral);
    assert.equal(reply.content, 'here you go 💛');
    assert.equal(sent.files.length, 1);
    assert.match(sent.files[0].attachment, /assets\/lovevest\/.*\.jpg$/);
  });

  await t.test('/define still returns definitions and handles missing words', async () => {
    let reply, deferred = false;
    const lookup = interaction('define', {
      options: { getString: (name) => name === 'word' ? 'amore' : 'it' },
      deferReply: async () => { deferred = true; }, editReply: async (payload) => { reply = payload; },
    });
    mock.method(globalThis, 'fetch', async (url) => {
      assert.match(url, /wiktionary.*\/amore$/);
      return Response.json({ it: [{ partOfSpeech: 'noun', definitions: [{ definition: '<b>love</b>' }] }] });
    });
    await handler(lookup);
    assert.equal(deferred, true);
    assert.equal(reply.embeds[0].data.title, 'amore (Italian)');
    assert.match(reply.embeds[0].data.fields[0].value, /love/);
    globalThis.fetch.mock.restore();
    mock.method(globalThis, 'fetch', async () => new Response('', { status: 404 }));
    await handler(lookup);
    assert.match(reply, /No definition found/);
    globalThis.fetch.mock.restore();
  });
});
