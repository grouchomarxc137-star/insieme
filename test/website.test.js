import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { io } from 'socket.io-client';
import { reportFixtures } from './support/reportFixtures.js';

test('website data, Discord deliveries, and two-person Reset Room sessions remain functional', { timeout: 30_000 }, async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'insieme-test-'));
  const sockets = [];
  let child, port;
  async function start() {
    child = fork(new URL('./support/serverHarness.js', import.meta.url), [], {
      env: { ...process.env, APP_DATA_DIR: directory }, execArgv: [], stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    let errors = '';
    child.stderr.on('data', (data) => { errors = (errors + data).slice(-4096); });
    port = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Server startup timed out: ' + errors)), 10_000);
      child.once('message', (message) => { clearTimeout(timeout); resolve(message.port); });
      child.once('exit', (code) => { clearTimeout(timeout); reject(new Error('Server exited: ' + code + ' ' + errors)); });
      child.once('error', reject);
    });
  }
  async function stop() {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const stopped = once(child, 'exit');
    child.kill('SIGTERM');
    const [code, signal] = await stopped;
    assert.equal(code, 0, 'Server failed graceful shutdown: ' + signal);
  }
  t.after(async () => {
    for (const socket of sockets) socket.disconnect();
    await stop();
    await rm(directory, { recursive: true, force: true });
  });
  await start();
  const url = () => 'http://127.0.0.1:' + port;
  async function api(route, method = 'GET', body) {
    const response = await fetch(url() + route, {
      method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = response.status === 204 ? null : await response.json();
    return { status: response.status, json };
  }
  async function calls() {
    const result = new Promise((resolve) => child.once('message', (message) => resolve(message.calls)));
    child.send('calls');
    return result;
  }
  async function connect() {
    const socket = io(url(), { transports: ['websocket'], forceNew: true, reconnection: false });
    sockets.push(socket);
    await once(socket, 'connect');
    return socket;
  }
  async function action(socket, event, payload = {}) {
    const result = await socket.timeout(3000).emitWithAck(event, payload);
    assert.equal(result.ok, true, result.message);
    return result;
  }
  async function waitFor(check) {
    for (let i = 0; i < 100; i++) {
      const value = await check();
      if (value) return value;
      await delay(20);
    }
    assert.fail('Expected state did not arrive');
  }

  await t.test('website moods still replace Discord messages and emergency cancel retracts them', async () => {
    for (const content of ['Available', 'Busy']) {
      assert.equal((await api('/api/discord-message', 'POST', { content, key: 'Principe-status', user: 'Principe', emoji: '✨' })).status, 204);
    }
    assert.equal((await api('/api/discord-message', 'POST', { content: 'Overwhelmed', key: 'Principe-emergency', user: 'Principe', emoji: '😩', emojiKind: 'emergency' })).status, 204);
    assert.equal((await api('/api/emergency-mood/cancel', 'POST', { user: 'Principe' })).status, 204);
    const relay = (await calls()).filter((call) => call.url.includes('/status'));
    assert.deepEqual(relay.map((call) => call.method), ['POST', 'DELETE', 'POST', 'POST', 'DELETE']);
  });

  await t.test('daily check-ins reveal only after both submit and deliver one real PDF', async () => {
    const fixture = reportFixtures()[0].payload;
    const first = await api('/api/checkins/daily', 'POST', { participant: 'Principe', responses: fixture.responses.Principe });
    assert.equal(first.status, 201);
    assert.equal(first.json.responses, null);
    const second = await api('/api/checkins/daily', 'POST', { participant: 'Principessa', responses: fixture.responses.Principessa });
    assert.equal(second.json.status, 'complete');
    assert.deepEqual(second.json.responses, fixture.responses);
    assert.equal((await api('/api/checkins/daily', 'POST', { participant: 'Principe', responses: fixture.responses.Principe })).status, 400);
    const reports = (await calls()).filter((call) => call.url.endsWith('/checkins'));
    assert.equal(reports.length, 1);
    assert.equal(reports[0].attachment.header, '%PDF-');
    assert.match(reports[0].attachment.name, /^daily-checkin-/);
    assert.equal((await api('/api/growth')).status, 200);
  });

  let milestoneId;
  await t.test('milestones persist across a graceful server restart', async () => {
    const created = await api('/api/milestones', 'POST', { label: 'Test memory update', icon: '💛', date: '2026-01-15' });
    assert.equal(created.status, 201);
    milestoneId = created.json.milestone.id;
    await stop();
    await start();
    assert.ok((await api('/api/milestones')).json.milestones.some((item) => item.id === milestoneId));
    assert.equal((await api('/api/checkins/daily')).json.status, 'complete');
  });

  await t.test('shared tickets still notify and archive; personal tickets remain private', async () => {
    const shared = await api('/api/tickets', 'POST', { title: 'A little time', message: 'A walk together', createdBy: 'Principe' });
    assert.equal(shared.status, 201);
    const id = shared.json.ticket.id;
    await waitFor(async () => (await calls()).some((call) => call.url.includes('/tickets')));
    for (const body of [
      { actor: 'Principessa', action: 'reply_ticket', reply: 'Yes, tonight.' },
      { actor: 'Principe', action: 'validate_ticket' },
      { actor: 'Principessa', action: 'close_ticket' },
    ]) assert.equal((await api('/api/tickets/' + id, 'PATCH', body)).status, 200);
    await waitFor(async () => (await calls()).some((call) => call.url.includes('/channels/archive-thread/messages')));
    const before = (await calls()).length;
    const personal = await api('/api/tickets', 'POST', { title: 'Private task', message: 'Read a chapter', createdBy: 'Principe', scope: 'personal' });
    assert.equal(personal.status, 201);
    await delay(50);
    assert.equal((await calls()).length, before);
  });

  await t.test('two clients can reconnect, switch roles and sessions, complete Reset Room and send its summary', async () => {
    const sessionId = (await api('/api/reset-sessions', 'POST', {})).json.id;
    const initiator = await connect();
    let responder = await connect();
    let responderPresence;
    responder.on('presence:update', (value) => { responderPresence = value; });
    const a = await action(initiator, 'session:join', { sessionId, role: 'initiator', name: 'Principe' });
    const b = await action(responder, 'session:join', { sessionId, role: 'responder', name: 'Principessa' });
    await waitFor(() => responderPresence?.initiatorConnected && responderPresence?.responderConnected);

    const disconnected = new Promise((resolve) => responder.once('disconnect', resolve));
    responder.disconnect();
    await disconnected;
    responder = await connect();
    await action(responder, 'session:join', { sessionId, token: b.token });
    await action(initiator, 'emotion:add', { text: 'I miss our time together', intensity: 3 });
    await action(initiator, 'entry:lock');
    const emotionId = (await api('/api/reset-sessions/' + sessionId)).json.emotions[0].id;
    await action(responder, 'ack:submit', { emotionId, text: 'You need more time together.' });
    await action(initiator, 'ack:feedback', { emotionId, accepted: true });
    await action(responder, 'reassurance:submit', { emotionId, skipped: true });
    assert.equal((await api('/api/reset-sessions/' + sessionId)).json.session.status, 'completed');
    await waitFor(async () => (await calls()).some((call) => call.url.endsWith('/channels/reset-channel/messages')));
    const summary = (await calls()).find((call) => call.url.endsWith('/channels/reset-channel/messages'));
    assert.equal(summary.attachment.header, '%PDF-');
    assert.match(summary.attachment.name, /^reset-room-/);

    // Switching the same socket must clear its previous presence and room.
    let observed;
    responder.on('presence:update', (value) => { observed = value; });
    const otherId = (await api('/api/reset-sessions', 'POST', {})).json.id;
    await action(initiator, 'session:join', { sessionId: otherId, role: 'initiator' });
    await waitFor(() => observed?.initiatorConnected === false && observed?.responderConnected === true);
    await action(initiator, 'session:cancel');
    assert.equal((await api('/api/reset-sessions/' + otherId)).json.session.status, 'cancelled');
    await action(initiator, 'session:join', { sessionId, token: a.token });
    await waitFor(() => observed?.initiatorConnected === true);
    await action(initiator, 'session:join', { sessionId, token: b.token });
    await waitFor(() => observed?.initiatorConnected === false && observed?.responderConnected === true);
    await action(initiator, 'session:join', { sessionId, token: b.token }); // Idempotent rejoin.
  });
});
