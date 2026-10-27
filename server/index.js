import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import express from 'express';
import { Server } from 'socket.io';
import { getNextMonthlyAnniversary, formatDate } from '../src/lib/moments.js';
import { typeLabel, getPeriodInfo } from '../src/lib/checkin.js';
import { monthKeyOf, monthLabel, shiftMonth } from '../src/lib/heatmap.js';
import {
  getCurrentCheckin,
  submitAnswers,
  toPublicView,
  PARTICIPANTS,
  getMonthlyRatings,
  setDayRating,
  clearDayRating,
  isValidRating,
  hasCheckinRating,
  wasReportSent,
  markReportSent,
} from './checkinRepo.js';
import { buildCheckinPdf, buildMonthlyHeatmapPdf, closePdfJobs, getPdfJobStats } from './pdfJobs.js';
import * as resetRoomRepo from './resetRoomRepo.js';
import { decorateState } from './resetRoomStateMachine.js';
import { registerSocketHandlers } from './resetRoomSocket.js';
import { startDiscordBot, stopDiscordBot, setStatusNickname, setEmergencyNickname, clearEmergencyNickname } from './resetRoomDiscordBot.js';
import { relayDiscordMessage, clearDiscordMessage } from './discordRelay.js';
import * as ticketsRepo from './ticketsRepo.js';
import { notifyTicketEvent } from './ticketsDiscordNotify.js';
import { ACCOUNT_ROLES, TICKET_SCOPE } from '../src/lib/tickets.js';
import * as taskListsRepo from './taskListsRepo.js';
import * as growthRepo from './growthRepo.js';
import * as milestonesRepo from './milestonesRepo.js';
import { FACTOR_CONFIG, DAILY_CHECKIN_AWARD } from '../src/lib/growthModel.js';

const CHECKIN_TYPES = ['daily', 'weekly'];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '..', 'dist');

const app = express();
app.use(express.json());

// The only place that ever sees DISCORD_WEBHOOK_URL — the frontend just
// posts message text (plus an optional dedup `key`) here and never touches
// the real webhook. The dedup-by-key delete-then-post logic lives in
// discordRelay.js so a website mood update replaces the same latest status
// message, including after a server restart.
app.post('/api/discord-message', async (req, res) => {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    res.status(500).json({ error: 'DISCORD_WEBHOOK_URL is not configured on the server.' });
    return;
  }

  const { content, key, user, emoji, emojiKind } = req.body || {};
  if (!content || typeof content !== 'string') {
    res.status(400).json({ error: 'content is required.' });
    return;
  }

  try {
    await relayDiscordMessage({ webhookUrl, content, key });

    // Status/Emergency Mood updates also carry `emoji` + `emojiKind`, which
    // is the signal to sync it onto the sender's server nickname. `status`
    // replaces the status half of the nickname; `emergency` adds/replaces
    // the emergency half alongside whatever status emoji is already there.
    if (user && emoji) {
      if (emojiKind === 'emergency') {
        await setEmergencyNickname(user, emoji);
      } else {
        await setStatusNickname(user, emoji);
      }
    }

    res.status(204).end();
  } catch (err) {
    res.status(502).json({ error: `Could not reach Discord: ${err.message}` });
  }
});

// Emergency Mood's "Cancel": retracts the live emergency message (nothing
// new to post, unlike the rest of this route) and drops the emergency emoji
// from the nickname, leaving the status emoji untouched.
app.post('/api/emergency-mood/cancel', async (req, res) => {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    res.status(500).json({ error: 'DISCORD_WEBHOOK_URL is not configured on the server.' });
    return;
  }

  const { user } = req.body || {};
  if (!PARTICIPANTS.includes(user)) {
    res.status(400).json({ error: 'user must be Principe or Principessa.' });
    return;
  }

  try {
    await clearDiscordMessage({ webhookUrl, key: `${user}-emergency` });
    await clearEmergencyNickname(user);
    res.status(204).end();
  } catch (err) {
    res.status(502).json({ error: `Could not reach Discord: ${err.message}` });
  }
});

// Sends the finished check-in PDF as a real file attachment via the
// webhook's multipart upload — the only way webhooks support attachments.
async function sendCheckinPdfToDiscord(pdfBuffer, filename, content) {
  const webhookUrl = process.env.DISCORD_CHECKIN_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log('[discord] DISCORD_CHECKIN_WEBHOOK_URL not set, skipping check-in PDF send');
    return;
  }

  const form = new FormData();
  form.append('payload_json', JSON.stringify({ content }));
  form.append('files[0]', new Blob([pdfBuffer], { type: 'application/pdf' }), filename);

  const response = await fetch(webhookUrl, { method: 'POST', body: form });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Discord rejected the check-in PDF: ${response.status} ${detail}`);
  }
}

// One month of the relationship heatmap. Registered before /api/checkins/:type
// so the two stay readable together — :type wouldn't match these longer paths
// anyway.
app.get('/api/checkins/daily/heatmap/:month', (req, res) => {
  const { month } = req.params;
  if (!/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: 'month must look like YYYY-MM.' });
    return;
  }
  res.json({ month, label: monthLabel(month), days: getMonthlyRatings(month) });
});

// Validates a hand-entered rating for a past day. The UI already hides the
// editor for ineligible days; this re-checks everything anyway, since the
// route is reachable directly.
function validateDayRatingRequest(dateParam, participant) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return 'date must look like YYYY-MM-DD.';
  }
  const [year, month, day] = dateParam.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
    return `"${dateParam}" is not a real date.`;
  }
  if (!PARTICIPANTS.includes(participant)) {
    return 'participant must be Principe or Principessa.';
  }
  // Today and later belong to the check-in flow — this is a backfill tool for
  // days that already got away.
  if (dateParam >= getPeriodInfo('daily').key) {
    return 'Only days before today can be filled in by hand.';
  }
  if (hasCheckinRating(dateParam, participant)) {
    return 'You already rated that day in its check-in, so it is locked.';
  }
  return null;
}

app.put('/api/checkins/daily/rating/:date', (req, res) => {
  const { date } = req.params;
  const { participant, rating } = req.body || {};

  const error = validateDayRatingRequest(date, participant);
  if (error) {
    res.status(400).json({ error });
    return;
  }
  if (!isValidRating(rating)) {
    res.status(400).json({ error: 'rating must be a whole number from 1 to 5.' });
    return;
  }

  setDayRating(date, participant, rating);
  res.status(200).json({ date, participant, rating });
});

app.delete('/api/checkins/daily/rating/:date', (req, res) => {
  const { date } = req.params;
  const { participant } = req.body || {};

  const error = validateDayRatingRequest(date, participant);
  if (error) {
    res.status(400).json({ error });
    return;
  }

  clearDayRating(date, participant);
  res.status(204).end();
});

app.get('/api/checkins/:type', (req, res) => {
  const { type } = req.params;
  if (!CHECKIN_TYPES.includes(type)) {
    res.status(404).json({ error: `Unknown check-in type "${type}"` });
    return;
  }
  res.json(toPublicView(getCurrentCheckin(type)));
});

// Merges this participant's answers into the current period's check-in. If
// this submission is the one that completes it (both people now in), builds
// the PDF and sends it to the check-in channel right here, server-side, so
// there's exactly one PDF per completed check-in regardless of whose device
// triggered it.
app.post('/api/checkins/:type', async (req, res) => {
  const { type } = req.params;
  if (!CHECKIN_TYPES.includes(type)) {
    res.status(404).json({ error: `Unknown check-in type "${type}"` });
    return;
  }

  const { participant, responses } = req.body || {};
  if (!PARTICIPANTS.includes(participant)) {
    res.status(400).json({ error: 'participant must be Principe or Principessa.' });
    return;
  }
  if (!responses || typeof responses !== 'object') {
    res.status(400).json({ error: 'responses is required.' });
    return;
  }

  let result;
  try {
    result = submitAnswers(type, participant, responses);
  } catch (err) {
    res.status(400).json({ error: err.message });
    return;
  }

  const { checkin, justCompleted } = result;

  if (justCompleted) {
    try {
      const pdfBuffer = await buildCheckinPdf({ type, periodLabel: checkin.periodLabel, responses: checkin.responses });
      const filename = `${type}-checkin-${checkin.periodKey}.pdf`;
      const content = `📝 ${typeLabel(type)} complete — ${checkin.periodLabel}. Principe & Principessa both submitted.`;
      await sendCheckinPdfToDiscord(pdfBuffer, filename, content);
      console.log(`[discord] check-in PDF sent for ${checkin.id}`);
    } catch (err) {
      console.log(`[discord] check-in PDF send failed for ${checkin.id}: ${err.message}`);
    }

    // Both submitting the daily check-in IS the two-sided confirmation the
    // old manual quick log used to need — award the tree XP right here
    // instead of waiting on a separate tap from each person.
    if (type === 'daily') {
      growthRepo.award({ ...DAILY_CHECKIN_AWARD, scope: 'shared', logId: checkin.id });
    }
  }

  res.status(201).json(toPublicView(checkin));
});

app.post('/api/reset-sessions', (req, res) => {
  const session = resetRoomRepo.createSession();
  res.status(201).json({ id: session.id });
});

app.get('/api/reset-sessions/:id', (req, res) => {
  const fullState = resetRoomRepo.getFullState(req.params.id);
  if (!fullState) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json(decorateState(fullState));
});

function reportTicketNotifyFailure(action) {
  return (err) => console.log(`[discord] ticket notify (${action}) failed: ${err.message}`);
}

app.get('/api/tickets', (req, res) => {
  // Yesterday's unfinished plans come back to the list, dayless, before it's
  // read — so the app never renders a task still claiming a day that's past.
  ticketsRepo.releaseStalePlans();
  res.json({ tickets: ticketsRepo.listTicketsForViewer(req.query.viewer) });
});

app.post('/api/tickets', (req, res) => {
  const { title, category, priority, replyStyle, mood, message, need, createdBy, scope } = req.body || {};
  if (!title || !message || !ACCOUNT_ROLES.includes(createdBy)) {
    res.status(400).json({ error: 'Missing required ticket fields.' });
    return;
  }
  const ticket = ticketsRepo.createTicket({ title, category, priority, replyStyle, mood, message, need, createdBy, scope });
  // Personal tickets are private and never post to Discord.
  if (ticket.scope !== TICKET_SCOPE.PERSONAL) {
    notifyTicketEvent(ticket, 'create_ticket').catch(reportTicketNotifyFailure('create_ticket'));
  }
  res.status(201).json({ ticket });
});

app.patch('/api/tickets/:id', (req, res) => {
  const { actor, action, status, reply, day, scheduledAt, durationMin } = req.body || {};
  const result = ticketsRepo.applyTicketAction(req.params.id, {
    actor,
    action,
    status,
    reply,
    day,
    scheduledAt,
    durationMin,
  });
  if (result.notFound) {
    res.status(404).json({ error: result.error });
    return;
  }
  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }
  if (result.ticket.scope !== TICKET_SCOPE.PERSONAL) {
    notifyTicketEvent(result.ticket, action).catch(reportTicketNotifyFailure(action));
  }
  res.json({ ticket: result.ticket });
});

app.delete('/api/tickets/:id', (req, res) => {
  const ticket = ticketsRepo.getTicket(req.params.id);
  if (!ticket) {
    res.status(404).json({ error: 'Ticket not found' });
    return;
  }
  ticketsRepo.deleteTicket(req.params.id);
  if (ticket.scope !== TICKET_SCOPE.PERSONAL) {
    notifyTicketEvent(ticket, 'delete_ticket').catch(reportTicketNotifyFailure('delete_ticket'));
  }
  res.json({ ok: true });
});

// Moments milestones — the couple adds/edits/removes their own dates here
// instead of them being hard-coded. Shared (no per-viewer scoping); the
// Discord anniversary reminder reads the same table.
app.get('/api/milestones', (req, res) => {
  res.json({ milestones: milestonesRepo.listMilestones() });
});

app.post('/api/milestones', (req, res) => {
  const { label, icon, date } = req.body || {};
  const result = milestonesRepo.createMilestone({ label, icon, date });
  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.status(201).json({ milestone: result });
});

app.patch('/api/milestones/:id', (req, res) => {
  const { label, icon, date, pinned } = req.body || {};
  const result = milestonesRepo.updateMilestone(req.params.id, { label, icon, date, pinned });
  if (result.notFound) {
    res.status(404).json({ error: result.error });
    return;
  }
  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({ milestone: result });
});

app.delete('/api/milestones/:id', (req, res) => {
  const result = milestonesRepo.deleteMilestone(req.params.id);
  if (result.notFound) {
    res.status(404).json({ error: result.error });
    return;
  }
  res.json({ ok: true });
});

// Task lists — server-backed so both people see the same lists (and can
// peek at each other's) from any device. `exists: false` with a default
// state tells the client this list has never been saved, which is what
// triggers its one-time localStorage import.
app.get('/api/task-lists/:key', (req, res) => {
  const { key } = req.params;
  if (!taskListsRepo.isValidKey(key)) {
    res.status(400).json({ error: 'Invalid list key.' });
    return;
  }
  const { exists, state, updatedAt } = taskListsRepo.getList(key);
  res.json({ exists, state: exists ? state : { tasks: [], locked: false }, updatedAt });
});

app.put('/api/task-lists/:key', (req, res) => {
  const { key } = req.params;
  if (!taskListsRepo.isValidKey(key)) {
    res.status(400).json({ error: 'Invalid list key.' });
    return;
  }
  const result = taskListsRepo.saveList(key, req.body || {});
  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json(result);
});

// Growth — the shared XP/meter state behind the Plant and Character pages.
// All awards land here so both people grow the same tree regardless of whose
// device did the tapping. Every response is the full flattened state (plus
// `seeded`), matching what useGrowth expects.

function growthView(state, seeded = true) {
  return { ...state, seeded };
}

function isValidXp(xp) {
  return Number.isFinite(xp) && xp >= 0 && xp <= 1000;
}

// scope defaults to 'shared' (the couple's one pot) when omitted, matching
// every call site from before personal tasks got their own pot. 'personal'
// requires a valid user so the credit/debit lands on the right person.
function parseScope(body) {
  const { scope, user } = body || {};
  if (scope === undefined || scope === 'shared') return { ok: true, scope: 'shared' };
  if (scope === 'personal') {
    if (!PARTICIPANTS.includes(user)) {
      return { ok: false, error: 'user must be Principe or Principessa for a personal award.' };
    }
    return { ok: true, scope: 'personal', user };
  }
  return { ok: false, error: `Unknown scope "${scope}".` };
}

app.get('/api/growth', (req, res) => {
  const { state, seeded } = growthRepo.getState();
  res.json(growthView(state, seeded));
});

app.post('/api/growth/award', (req, res) => {
  const { xp, factor, factorGain } = req.body || {};
  if (!isValidXp(xp)) {
    res.status(400).json({ error: 'xp must be a number between 0 and 1000.' });
    return;
  }
  if (factor !== undefined && !(factor in FACTOR_CONFIG)) {
    res.status(400).json({ error: `Unknown factor "${factor}".` });
    return;
  }
  const parsedScope = parseScope(req.body);
  if (!parsedScope.ok) {
    res.status(400).json({ error: parsedScope.error });
    return;
  }
  const state = growthRepo.award({
    xp,
    factor,
    factorGain: Number.isFinite(factorGain) ? factorGain : 0,
    scope: parsedScope.scope,
    user: parsedScope.user,
  });
  res.json(growthView(state));
});

app.post('/api/growth/unaward', (req, res) => {
  const { xp, factor, factorGain } = req.body || {};
  if (!isValidXp(xp)) {
    res.status(400).json({ error: 'xp must be a number between 0 and 1000.' });
    return;
  }
  if (factor !== undefined && !(factor in FACTOR_CONFIG)) {
    res.status(400).json({ error: `Unknown factor "${factor}".` });
    return;
  }
  const parsedScope = parseScope(req.body);
  if (!parsedScope.ok) {
    res.status(400).json({ error: parsedScope.error });
    return;
  }
  const state = growthRepo.unaward({
    xp,
    factor,
    factorGain: Number.isFinite(factorGain) ? factorGain : 0,
    scope: parsedScope.scope,
    user: parsedScope.user,
  });
  res.json(growthView(state));
});

app.post('/api/growth/monthly-lock', (req, res) => {
  const { logId, taskCount } = req.body || {};
  if (typeof logId !== 'string' || !/^[\w-]{1,60}$/.test(logId)) {
    res.status(400).json({ error: 'logId is required.' });
    return;
  }
  if (!Number.isInteger(taskCount) || taskCount < 1 || taskCount > 10) {
    res.status(400).json({ error: 'taskCount must be an integer between 1 and 10.' });
    return;
  }
  const parsedScope = parseScope(req.body);
  if (!parsedScope.ok) {
    res.status(400).json({ error: parsedScope.error });
    return;
  }
  const { state } = growthRepo.monthlyLockBonus(logId, taskCount, {
    scope: parsedScope.scope,
    user: parsedScope.user,
  });
  res.json(growthView(state));
});

app.post('/api/growth/quicklog/confirm', (req, res) => {
  const { user, logId } = req.body || {};
  const result = growthRepo.confirmQuickLog(user, logId);
  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json(growthView(result.state));
});

app.post('/api/growth/quicklog/remove', (req, res) => {
  const { logId, side } = req.body || {};
  if (typeof logId !== 'string' || typeof side !== 'string') {
    res.status(400).json({ error: 'logId and side are required.' });
    return;
  }
  res.json(growthView(growthRepo.removeQuickLogConfirmation(logId, side)));
});

// One-time migration of a device's localStorage growth state — only accepted
// while the server has never stored any growth state of its own.
app.post('/api/growth/import', (req, res) => {
  const { state } = req.body || {};
  if (!state || typeof state !== 'object') {
    res.status(400).json({ error: 'state is required.' });
    return;
  }
  const result = growthRepo.importState(state);
  res.status(result.imported ? 201 : 200).json(growthView(result.state));
});

// Local (server-timezone) Y-M-D key — kept in local time throughout, same as
// the date math in src/lib/moments.js, so "today" always means the same day
// this code is already reasoning about.
function localDateKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

// One reminder per milestone per calendar day — in-memory only, so a server
// restart on the actual reminder day could in theory cause one duplicate
// send, but that's a rare, low-stakes edge case for this.
const lastAnniversaryReminderSent = new Map();

async function checkAnniversaryReminders() {
  const webhookUrl = process.env.DISCORD_ANNIVERSARY_WEBHOOK_URL;
  if (!webhookUrl) return;

  const now = new Date();
  const todayKey = localDateKey(now);

  for (const milestone of milestonesRepo.listMilestones()) {
    const baseDate = new Date(milestone.date);
    const nextAnniversary = getNextMonthlyAnniversary(baseDate, now);
    const reminderDay = new Date(nextAnniversary);
    reminderDay.setDate(reminderDay.getDate() - 1);

    const isReminderDay = localDateKey(reminderDay) === todayKey;
    const alreadySentToday = lastAnniversaryReminderSent.get(milestone.id) === todayKey;
    if (!isReminderDay || alreadySentToday) continue;

    const content = `🔔 Heads up — tomorrow, **${formatDate(nextAnniversary)}**, is your monthly anniversary for **${milestone.label}** ${milestone.icon}`;
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (response.ok) {
        lastAnniversaryReminderSent.set(milestone.id, todayKey);
        console.log(`[discord] anniversary reminder sent for "${milestone.id}"`);
      } else {
        console.log(`[discord] anniversary reminder rejected for "${milestone.id}": ${response.status}`);
      }
    } catch (err) {
      console.log(`[discord] anniversary reminder error for "${milestone.id}": ${err.message}`);
    }
  }
}

// Populate the milestones table with the original three on first run, before
// anything reads from it.
milestonesRepo.seedDefaults();

// Check right away (covers a restart landing on a reminder day) and then
// hourly — no cron dependency needed for once-a-day-ish precision.
checkAnniversaryReminders();
const anniversaryTimer = setInterval(checkAnniversaryReminders, 60 * 60 * 1000);

// How long into the new month to wait before reporting the previous one. At 1
// the report goes out in the first hour of the 1st, so days backfilled after
// that won't be in the PDF that was already posted — bump this to give
// yourselves a grace period to fill in forgotten days first.
const REPORT_ON_DAY_OF_MONTH = 1;

// Once a month is over, its heatmap goes to the same check-in channel as the
// daily PDFs. Dedup is in the database, not in memory: a restart must not
// re-post a month that already went out.
async function checkMonthlyHeatmapReport() {
  // Bail before marking anything as sent — otherwise a month would be recorded
  // as reported while the webhook was misconfigured, and never retried.
  if (!process.env.DISCORD_CHECKIN_WEBHOOK_URL) return;

  const now = new Date();
  if (now.getDate() < REPORT_ON_DAY_OF_MONTH) return;

  const previous = shiftMonth(monthKeyOf(now), -1);
  const reportId = `monthly-heatmap-${previous}`;
  if (wasReportSent(reportId)) return;

  const days = getMonthlyRatings(previous);
  if (Object.keys(days).length === 0) {
    // Nothing was ever logged that month — mark it done so this doesn't run
    // every hour for the rest of the month.
    markReportSent(reportId);
    return;
  }

  try {
    const pdfBuffer = await buildMonthlyHeatmapPdf({ monthKey: previous, days });
    await sendCheckinPdfToDiscord(
      pdfBuffer,
      `relationship-heatmap-${previous}.pdf`,
      `📊 Relationship heatmap — ${monthLabel(previous)}`
    );
    // Only after Discord accepted it, so a failed send retries next hour.
    markReportSent(reportId);
    console.log(`[discord] monthly heatmap sent for ${previous}`);
  } catch (err) {
    console.log(`[discord] monthly heatmap send failed for ${previous}: ${err.message}`);
  }
}

checkMonthlyHeatmapReport();
const heatmapTimer = setInterval(checkMonthlyHeatmapReport, 60 * 60 * 1000);

// Production: this same process serves the built frontend, so Railway only
// needs to run one service. In dev, Vite's own server proxies /api here
// instead (see vite.config.js) and this static block is simply never hit.
app.use(express.static(distDir));
app.use((req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

export const httpServer = createServer(app);
const io = new Server(httpServer, {
  path: '/socket.io',
});
registerSocketHandlers(io);
startDiscordBot();

const port = process.env.PORT || 8787;
httpServer.listen(port, () => {
  console.log(`Discord relay server listening on port ${port}`);
});

// Opt-in operational measurements; no report contents, credentials, or public
// diagnostics endpoint. Railway's graph includes child processes as well.
let memoryTimer;
if (process.env.MEMORY_DIAGNOSTICS === '1') {
  const logMemory = () => console.log('[memory]', JSON.stringify({
    ...process.memoryUsage(),
    pdfJobs: getPdfJobStats(),
    sockets: io.engine.clientsCount,
  }));
  logMemory();
  memoryTimer = setInterval(logMemory, 60_000);
  memoryTimer.unref();
}

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(anniversaryTimer);
  clearInterval(heatmapTimer);
  clearInterval(memoryTimer);
  const deadline = setTimeout(() => process.exit(1), 10_000);
  deadline.unref();
  await Promise.allSettled([
    closePdfJobs(),
    stopDiscordBot(),
    new Promise((resolve) => io.close(resolve)),
  ]);
  clearTimeout(deadline);
  process.exit(0);
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
