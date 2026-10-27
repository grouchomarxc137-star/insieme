import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { createKeyedQueue } from '../server/keyedQueue.js';
import { createPresenceTracker } from '../server/presenceTracker.js';

test('relay tasks preserve per-key ordering while other keys run independently', async () => {
  const queue = createKeyedQueue();
  const order = [];
  let releaseFirst, releaseSecond;
  const firstGate = new Promise((r) => { releaseFirst = r; });
  const secondGate = new Promise((r) => { releaseSecond = r; });
  const first = queue.run('mood', async () => { order.push(1); await firstGate; });
  const second = queue.run('mood', async () => { order.push(2); await secondGate; });
  await queue.run('other', () => order.push('other'));
  assert.deepEqual(order, [1, 'other']);
  releaseFirst();
  await first;
  await setImmediate();
  assert.equal(queue.size, 1, 'older completion removed a newer task');
  const third = queue.run('mood', () => order.push(3));
  await setImmediate();
  assert.deepEqual(order, [1, 'other', 2]);
  releaseSecond();
  await Promise.all([second, third]);
  await setImmediate();
  assert.deepEqual(order, [1, 'other', 2, 3]);
  assert.equal(queue.size, 0);
});

test('failed relay work does not block later work or retain queue entries', async () => {
  const queue = createKeyedQueue();
  const failure = queue.run('mood', () => { throw new Error('Discord unavailable'); });
  const next = queue.run('mood', () => 'delivered');
  await assert.rejects(failure, /Discord unavailable/);
  assert.equal(await next, 'delivered');
  await Promise.all(Array.from({ length: 1000 }, (_, i) => queue.run('key-' + i, () => i)));
  await setImmediate();
  assert.equal(queue.size, 0);
});

test('presence preserves multiple tabs and releases empty sessions without recreating them', () => {
  const presence = createPresenceTracker();
  presence.add('a', 'initiator', 'tab-1');
  presence.add('a', 'initiator', 'tab-2');
  presence.add('a', 'responder', 'partner');
  presence.remove('a', 'initiator', 'tab-1');
  assert.deepEqual(presence.snapshot('a'), { initiatorConnected: true, responderConnected: true });
  presence.remove('a', 'initiator', 'tab-2');
  assert.deepEqual(presence.snapshot('a'), { initiatorConnected: false, responderConnected: true });
  presence.remove('a', 'responder', 'partner');
  assert.equal(presence.size, 0);
  assert.deepEqual(presence.snapshot('a'), { initiatorConnected: false, responderConnected: false });
  presence.remove('a', 'responder', 'partner');
  assert.equal(presence.size, 0);
  presence.add('a', 'initiator', 'reconnect');
  assert.equal(presence.snapshot('a').initiatorConnected, true);
});
