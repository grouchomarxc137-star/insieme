import { fork } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: {
  'baseline-root': { type: 'string' }, runs: { type: 'string', default: '3' },
} });
const runs = Number(values.runs);
if (!Number.isInteger(runs) || runs < 1 || runs > 10) throw new Error('--runs must be between 1 and 10');
const root = fileURLToPath(new URL('..', import.meta.url));
const median = (numbers) => [...numbers].sort((a, b) => a - b)[Math.floor(numbers.length / 2)];
const mib = (bytes) => +(bytes / 1048576).toFixed(1);

// Linux-only RSS sum for the probe and its renderer descendants. Shared
// pages can be counted twice; Railway's container graph is authoritative.
function linuxTreeRss(pid) {
  const status = readFileSync(`/proc/${pid}/status`, 'utf8');
  let bytes = Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1] || 0) * 1024;
  const children = readFileSync(`/proc/${pid}/task/${pid}/children`, 'utf8').trim();
  for (const child of children.split(/\s+/).filter(Boolean)) {
    try { bytes += linuxTreeRss(child); } catch { /* Child exited between samples. */ }
  }
  return bytes;
}

async function measure(directory) {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'insieme-benchmark-'));
  let child, timer;
  try {
    child = fork(new URL('./memory-probe.mjs', import.meta.url), [directory], {
      cwd: directory, execArgv: [], env: { ...process.env, APP_DATA_DIR: dataDir },
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    let stderr = '', peakTreeRss = 0;
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-4096); });
    const canSampleTree = process.platform === 'linux' && existsSync('/proc/self/status');
    if (canSampleTree) timer = setInterval(() => {
      try { peakTreeRss = Math.max(peakTreeRss, linuxTreeRss(child.pid)); } catch { /* Probe exited. */ }
    }, 50);
    const result = await new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error('Memory probe timed out')), 60_000);
      child.once('message', (value) => { clearTimeout(deadline); resolve(value); });
      child.once('exit', (code) => { clearTimeout(deadline); reject(new Error(`Probe exited (${code}): ${stderr}`)); });
      child.once('error', (error) => { clearTimeout(deadline); reject(error); });
    });
    return { ...result, peakTreeRss: canSampleTree ? peakTreeRss : null };
  } finally {
    clearInterval(timer);
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = new Promise((resolve) => child.once('exit', resolve));
      child.kill('SIGTERM');
      await exited;
    }
    await rm(dataDir, { recursive: true, force: true });
  }
}

function summarize(samples) {
  return {
    startupRssMiB: mib(median(samples.map((sample) => sample.startup.rss))),
    afterReportsIdleRssMiB: mib(median(samples.map((sample) => sample.warmed.rss))),
    peakProcessTreeRssMiB: samples[0].peakTreeRss === null ? null : mib(Math.max(...samples.map((sample) => sample.peakTreeRss))),
    pdfKitLoadedInMainProcess: samples.some((sample) => sample.pdfKitLoadedAtStartup || sample.pdfKitLoadedAfterReports),
    medianReportMilliseconds: Math.round(median(samples.flatMap((sample) => sample.timings.map((job) => job.milliseconds)))),
    samples,
  };
}

const output = { node: process.version, platform: process.platform, runs };
if (values['baseline-root']) {
  const baselineRoot = path.resolve(values['baseline-root']);
  await readFile(path.join(baselineRoot, 'server/index.js')); // Fail before starting probes if invalid.
  const baseline = [], optimized = [];
  for (let i = 0; i < runs; i++) {
    baseline.push(await measure(baselineRoot));
    optimized.push(await measure(root));
  }
  output.baseline = summarize(baseline);
  output.optimized = summarize(optimized);
  output.idleReductionPercent = +(100 * (1 - output.optimized.afterReportsIdleRssMiB / output.baseline.afterReportsIdleRssMiB)).toFixed(1);
} else {
  const samples = [];
  for (let i = 0; i < runs; i++) samples.push(await measure(root));
  output.optimized = summarize(samples);
}
console.log(JSON.stringify(output, null, 2));
