// Scheduling model for the Calendar page — the geometry of the time grid and
// the shape of the two fields a task carries once it's planned. Shared by the
// client (to draw the grid and place blocks) and the server
// (server/ticketsRepo.js, to validate what gets stored), the same way
// tasksModel.js is, so the two can never disagree on what a valid slot is.
import { dayKey } from './tasksModel.js';

export { dayKey };

// The grid only renders the hours anyone actually plans in — a full 24-hour
// column is mostly empty space you have to scroll past to reach the evening.
export const DAY_START_HOUR = 7;
export const DAY_END_HOUR = 23;
export const HOUR_PX = 56;
export const PX_PER_MIN = HOUR_PX / 60;
// Drops snap to quarter hours: fine enough to place things where you mean,
// coarse enough that a shaky finger on a phone never lands on 14:07.
export const SNAP_MIN = 15;

export const GRID_START_MIN = DAY_START_HOUR * 60;
export const GRID_END_MIN = DAY_END_HOUR * 60;
export const GRID_HEIGHT_PX = (GRID_END_MIN - GRID_START_MIN) * PX_PER_MIN;

export const DEFAULT_DURATION_MIN = 30;
export const MIN_DURATION_MIN = 15;
export const MAX_DURATION_MIN = 480;
export const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120, 180, 240];

function pad(n) {
  return String(n).padStart(2, '0');
}

// Estimates are only ever picked from DURATION_OPTIONS in the UI, but the
// server can't trust that — anything off-grid is snapped back to a quarter
// hour inside the allowed range rather than rejected, so a bad request never
// costs someone their drop.
export function clampDuration(value) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes)) return DEFAULT_DURATION_MIN;
  const snapped = Math.round(minutes / SNAP_MIN) * SNAP_MIN;
  return Math.min(MAX_DURATION_MIN, Math.max(MIN_DURATION_MIN, snapped));
}

export function formatDuration(minutes) {
  const total = clampDuration(minutes);
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (!hours) return `${mins}m`;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}

// Minutes from midnight → "14:30". The whole app is single-timezone (two
// people, one household), so times are stored as wall-clock strings rather
// than UTC instants: what you dropped at 2pm still reads 2pm no matter what
// the browser thinks its offset is.
export function formatClock(minutes) {
  const safe = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)));
  return `${pad(Math.floor(safe / 60))}:${pad(safe % 60)}`;
}

export const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const SLOT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export function isDayKey(value) {
  return typeof value === 'string' && DAY_PATTERN.test(value);
}

export function isSlot(value) {
  return typeof value === 'string' && SLOT_PATTERN.test(value);
}

export function makeSlot(day, minutes) {
  return `${day}T${formatClock(minutes)}`;
}

export function slotDay(slot) {
  return isSlot(slot) ? slot.slice(0, 10) : '';
}

export function slotMinutes(slot) {
  if (!isSlot(slot)) return 0;
  return Number(slot.slice(11, 13)) * 60 + Number(slot.slice(14, 16));
}

// A dropped block can't start so late that it hangs off the bottom of the
// grid — the last valid start is one snap step before the end of the day.
export function clampSlotMinutes(minutes) {
  const snapped = Math.round(minutes / SNAP_MIN) * SNAP_MIN;
  return Math.min(GRID_END_MIN - SNAP_MIN, Math.max(GRID_START_MIN, snapped));
}

export function addDays(day, delta) {
  const [year, month, date] = day.split('-').map(Number);
  const shifted = new Date(year, month - 1, date + delta);
  return dayKey(shifted);
}

export function formatDayLabel(day) {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date).toLocaleDateString([], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

// "Today" / "Tomorrow" / "Yesterday" read faster than a date when you're
// only ever a day or two from now; anything further away gets the real date.
export function relativeDayLabel(day, today = dayKey()) {
  if (day === today) return 'Today';
  if (day === addDays(today, 1)) return 'Tomorrow';
  if (day === addDays(today, -1)) return 'Yesterday';
  return formatDayLabel(day);
}

export function minutesNow(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes();
}
