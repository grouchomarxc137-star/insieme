import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createPdfQueue } from '../server/pdfJobs.js';
import { reportFixtures } from './support/reportFixtures.js';

test('all report types are byte-identical inside an isolated process', async (t) => {
  mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 9, 27, 12) });
  t.after(() => mock.timers.reset());
  const queue = createPdfQueue({ workerUrl: new URL('./support/frozenPdfWorker.js', import.meta.url) });
  t.after(() => queue.close());
  for (const fixture of reportFixtures()) {
    const renderer = await import('../server/' + fixture.module);
    const expected = await renderer[fixture.builder](fixture.payload);
    const actual = await queue.run(fixture.kind, fixture.payload);
    assert.deepEqual(actual, expected, fixture.name + ' PDF changed');
    assert.deepEqual(queue.getStats(), { active: 0, pending: 0 });
    if (process.env.PDF_TEST_OUTPUT_DIR) {
      await mkdir(process.env.PDF_TEST_OUTPUT_DIR, { recursive: true });
      await writeFile(process.env.PDF_TEST_OUTPUT_DIR + '/' + fixture.name + '.pdf', actual);
    }
  }
});

test('the production worker renders without touching the database and recovers after errors', async (t) => {
  const original = process.env.APP_DATA_DIR;
  process.env.APP_DATA_DIR = new URL(import.meta.url).pathname; // A file, so mkdir would fail.
  t.after(() => {
    if (original === undefined) delete process.env.APP_DATA_DIR;
    else process.env.APP_DATA_DIR = original;
  });
  const queue = createPdfQueue();
  t.after(() => queue.close());
  await assert.rejects(queue.run('checkin', null));
  const fixture = reportFixtures()[0];
  const pdf = await queue.run(fixture.kind, fixture.payload);
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.deepEqual(queue.getStats(), { active: 0, pending: 0 });
});

test('jobs serialize, timed-out and crashed children exit, and the queue continues', async (t) => {
  const queue = createPdfQueue({ workerUrl: new URL('./support/controlledPdfWorker.js', import.meta.url), timeoutMs: 1000 });
  t.after(() => queue.close());
  const hung = queue.run('checkin', { mode: 'hang' });
  const hungFailure = assert.rejects(hung, /timed out/);
  const crash = queue.run('checkin', { mode: 'crash' });
  const crashFailure = assert.rejects(crash, /exited without a document \(2\)/);
  const success = queue.run('checkin', {});
  assert.deepEqual(queue.getStats(), { active: 1, pending: 2 });
  await Promise.all([hungFailure, crashFailure]);
  const pdf = await success;
  const pid = Number(pdf.toString().split('\n')[1]);
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  assert.deepEqual(queue.getStats(), { active: 0, pending: 0 });
});

test('shutdown stops the active child, rejects queued jobs, and disallows new jobs', async () => {
  const queue = createPdfQueue({ workerUrl: new URL('./support/controlledPdfWorker.js', import.meta.url) });
  const activeFailure = assert.rejects(queue.run('checkin', { mode: 'hang' }), /shutting down/);
  const queuedFailure = assert.rejects(queue.run('checkin', {}), /shutting down/);
  await queue.close();
  await Promise.all([activeFailure, queuedFailure]);
  await assert.rejects(queue.run('checkin', {}), /shutting down/);
  assert.deepEqual(queue.getStats(), { active: 0, pending: 0 });
});
