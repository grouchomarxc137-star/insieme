import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { reportFixtures } from '../test/support/reportFixtures.js';

// Full web process with integrations disabled, using synthetic report data.
// This isolates local library/rendering overhead without real Discord sends.
for (const key of Object.keys(process.env)) if (key.startsWith('DISCORD_')) delete process.env[key];
Object.assign(process.env, { PORT: '0', DOTENV_CONFIG_PATH: '/dev/null', MEMORY_DIAGNOSTICS: '' });
const root = process.argv[2];
const require = createRequire(import.meta.url);
const moduleUrl = (name) => pathToFileURL(path.join(root, 'server', name)).href;
await import(moduleUrl('index.js'));
await delay(1500);
const startup = process.memoryUsage();
const pdfKitLoaded = () => Object.keys(require.cache).some((name) => /node_modules[/\\]pdfkit[/\\]/.test(name));
const loadedAtStartup = pdfKitLoaded();
const isolated = existsSync(path.join(root, 'server/pdfJobs.js'));
const timings = [];
for (let cycle = 0; cycle < 2; cycle++) {
  for (const fixture of reportFixtures()) {
    const renderer = await import(moduleUrl(isolated ? 'pdfJobs.js' : fixture.module));
    const start = performance.now();
    const result = await renderer[fixture.builder](fixture.payload);
    if (result.subarray(0, 5).toString() !== '%PDF-') throw new Error('Invalid report');
    timings.push({ name: fixture.name, milliseconds: performance.now() - start, bytes: result.length });
  }
}
await delay(2000);
process.send({
  startup, warmed: process.memoryUsage(), timings,
  pdfKitLoadedAtStartup: loadedAtStartup, pdfKitLoadedAfterReports: pdfKitLoaded(),
});
