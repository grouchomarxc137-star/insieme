// Relationship milestones — the dates behind the Moments counters.
export const MILESTONES = [
  { id: 'speaking', icon: '💬', label: 'Since we started talking', date: '2025-11-07T23:59:00' },
  { id: 'official', icon: '💍', label: 'Since we made it official', date: '2026-01-29T18:00:00' },
  { id: 'first-met', icon: '💋', label: 'Since we first met IRL', date: '2026-02-13T00:00:00' },
];

export function formatDate(date) {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// Adds `monthsToAdd` months to `date`, clamping the day-of-month to fit the
// target month (e.g. Jan 29 + 1 month -> Feb 28 in a non-leap year, not an
// overflow into March 1). Always built fresh from `date`, never from a
// previous result, so repeated calls can't compound a day-of-month drift.
function addMonthsClamped(date, monthsToAdd) {
  const result = new Date(date);
  result.setDate(1); // park on a safe day before changing the month
  result.setMonth(date.getMonth() + monthsToAdd);
  const daysInTargetMonth = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(date.getDate(), daysInTargetMonth));
  return result;
}

// Calendar-aware duration: counts whole months first (respecting each
// month's actual length), then the remaining days/hours/minutes/seconds.
export function getDurationParts(from, to) {
  if (to <= from) {
    return { months: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };
  }

  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  let anchor = addMonthsClamped(from, months);
  if (anchor > to) {
    months -= 1;
    anchor = addMonthsClamped(from, months);
  }

  const diffMs = Math.max(0, to - anchor);
  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { months, days, hours, minutes, seconds };
}

// The next monthly day-of-month anniversary of a date, after `now`.
export function getNextMonthlyAnniversary(baseDate, now) {
  let k = 0;
  let candidate = addMonthsClamped(baseDate, k);
  while (candidate <= now) {
    k += 1;
    candidate = addMonthsClamped(baseDate, k);
  }
  return candidate;
}
