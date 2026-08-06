// Calendar math for the relationship heatmap. Pure and dependency-free so the
// server's monthly PDF builder can import it alongside the React grid — the
// same crossing server/checkinRepo.js already makes with ./checkin.js.

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Monday-first, matching how a week reads in Italy.
export const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function pad(n) {
  return String(n).padStart(2, '0');
}

export function monthKeyOf(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

export function parseMonthKey(key) {
  const [year, month] = key.split('-').map(Number);
  return { year, month: month - 1 };
}

export function monthLabel(key) {
  const { year, month } = parseMonthKey(key);
  return `${MONTH_NAMES[month]} ${year}`;
}

export function shiftMonth(key, delta) {
  const { year, month } = parseMonthKey(key);
  const shifted = new Date(year, month + delta, 1);
  return monthKeyOf(shifted);
}

export function isFutureMonth(key) {
  return key > monthKeyOf(new Date());
}

// Same `YYYY-MM-DD` shape as getDailyPeriodInfo in ./checkin.js, so grid cells
// join straight against checkins.period_key with no conversion.
export function dateKeyOf(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Rows of 7, Monday-first, with null in the leading/trailing pad slots so the
// caller can render an empty cell without special-casing the month's edges.
export function buildMonthGrid(key) {
  const { year, month } = parseMonthKey(key);
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingPad = (first.getDay() + 6) % 7; // Sunday (0) becomes 6

  const cells = [];
  for (let i = 0; i < leadingPad; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ day, dateKey: `${year}-${pad(month + 1)}-${pad(day)}` });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
