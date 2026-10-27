import { fork } from 'node:child_process';

const WORKER_URL = new URL('./pdfWorker.js', import.meta.url);
const JOB_TYPES = new Set(['checkin', 'monthly-heatmap', 'reset-room']);

// A fresh process per document keeps PDFKit, font tables, and rendering
// allocations out of the long-lived web/Discord process. Serialize jobs so
// simultaneous reports cannot create a burst of renderer processes.
export function createPdfQueue({ workerUrl = WORKER_URL, timeoutMs = 60_000 } = {}) {
  const pending = [];
  let active = null;
  let closed = false;

  function pump() {
    if (closed || active || pending.length === 0) return;
    const job = pending.shift();
    let child;
    try {
      child = fork(workerUrl, [], {
        stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
        serialization: 'advanced',
        // Do not inherit a development watcher, inspector, or test loader.
        execArgv: [],
      });
    } catch (err) {
      job.reject(err);
      queueMicrotask(pump);
      return;
    }

    let pdf;
    let failure;
    let stderr = '';
    function fail(err) {
      failure ||= err;
      child.kill('SIGKILL');
    }
    const timer = setTimeout(() => fail(new Error('PDF generation timed out after ' + timeoutMs + 'ms')), timeoutMs);
    active = { child, fail };

    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-4096);
    });
    child.on('message', (message) => {
      if (message?.ok && Buffer.isBuffer(message.pdf) && message.pdf.subarray(0, 5).toString() === '%PDF-') {
        pdf = message.pdf;
      } else {
        fail(new Error(message?.error || 'PDF renderer returned an invalid document'));
      }
    });
    child.once('error', fail);
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      active = null;
      if (failure) {
        job.reject(failure);
      } else if (code !== 0 || !pdf) {
        job.reject(new Error(`PDF renderer exited without a document (${signal || code})${stderr ? ': ' + stderr.trim() : ''}`));
      } else {
        job.resolve(pdf);
      }
      // Wait for process exit, not just delivery of its result, before the
      // next renderer starts or the caller begins uploading the attachment.
      pump();
    });
    try {
      child.send({ kind: job.kind, payload: job.payload }, (err) => {
        if (err) fail(err);
      });
    } catch (err) {
      fail(err);
    }
  }

  return {
    run(kind, payload) {
      if (closed) return Promise.reject(new Error('PDF renderer is shutting down'));
      if (!JOB_TYPES.has(kind)) return Promise.reject(new Error('Unknown PDF job type'));
      return new Promise((resolve, reject) => {
        pending.push({ kind, payload, resolve, reject });
        pump();
      });
    },
    async close() {
      closed = true;
      for (const job of pending.splice(0)) job.reject(new Error('PDF renderer is shutting down'));
      if (active) {
        const stopped = new Promise((resolve) => active.child.once('close', resolve));
        active.fail(new Error('PDF renderer is shutting down'));
        await stopped;
      }
    },
    getStats() {
      return { active: active ? 1 : 0, pending: pending.length };
    },
  };
}

const queue = createPdfQueue();
export const buildCheckinPdf = (payload) => queue.run('checkin', payload);
export const buildMonthlyHeatmapPdf = (payload) => queue.run('monthly-heatmap', payload);
export const buildResetRoomSummaryPdf = (payload) => queue.run('reset-room', payload);
export const closePdfJobs = () => queue.close();
export const getPdfJobStats = () => queue.getStats();
