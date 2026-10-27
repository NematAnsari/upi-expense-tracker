// Timestamps are stored as UTC milliseconds (Date.getTime()).
// Month and day boundaries are calculated in the phone's local timezone, so an
// expense at 11:30 PM on the 31st belongs to that month, not the next one.

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function pad2(value) {
  return String(value).padStart(2, '0');
}

/** "YYYY-MM" for the month containing the given date (local time). */
export function getMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

export function parseMonthKey(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  return { year, month };
}

/** Start (inclusive) and end (exclusive) of a month, in milliseconds. */
export function getMonthRange(monthKey) {
  const { year, month } = parseMonthKey(monthKey);
  return {
    startMs: new Date(year, month - 1, 1).getTime(),
    endMs: new Date(year, month, 1).getTime(),
  };
}

export function shiftMonth(monthKey, delta) {
  const { year, month } = parseMonthKey(monthKey);
  return getMonthKey(new Date(year, month - 1 + delta, 1));
}

export function isCurrentOrFutureMonth(monthKey, now = new Date()) {
  return monthKey >= getMonthKey(now);
}

export function formatMonthLabel(monthKey) {
  const { year, month } = parseMonthKey(monthKey);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/** Start (inclusive) and end (exclusive) of the local day containing the date. */
export function getDayRange(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return { startMs: start.getTime(), endMs: end.getTime() };
}

/**
 * Splits a month into week-sized buckets: 1-7, 8-14, 15-21, 22-28, 29-end.
 * Simple calendar chunks are easier to read than ISO weeks that cross months.
 */
export function getWeekBuckets(monthKey) {
  const { year, month } = parseMonthKey(monthKey);
  const daysInMonth = new Date(year, month, 0).getDate();
  const shortMonth = MONTH_NAMES[month - 1].slice(0, 3);
  const buckets = [];

  for (let firstDay = 1; firstDay <= daysInMonth; firstDay += 7) {
    const lastDay = Math.min(firstDay + 6, daysInMonth);
    buckets.push({
      label: `${firstDay}-${lastDay} ${shortMonth}`,
      startMs: new Date(year, month - 1, firstDay).getTime(),
      endMs: new Date(year, month - 1, lastDay + 1).getTime(),
    });
  }
  return buckets;
}

/** "25 Oct 2026" */
export function formatDate(ms) {
  const date = new Date(ms);
  return `${date.getDate()} ${MONTH_NAMES[date.getMonth()].slice(0, 3)} ${date.getFullYear()}`;
}

/** "3:05 PM" */
export function formatTime(ms) {
  const date = new Date(ms);
  const hours = date.getHours();
  const displayHours = hours % 12 === 0 ? 12 : hours % 12;
  return `${displayHours}:${pad2(date.getMinutes())} ${hours < 12 ? 'AM' : 'PM'}`;
}

/** "Today", "Yesterday", or "25 Oct 2026" (local time). */
export function formatDayLabel(ms, now = new Date()) {
  const today = getDayRange(now);
  const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
  if (ms >= today.startMs && ms < today.endMs) {
    return 'Today';
  }
  if (ms >= yesterdayStart && ms < today.startMs) {
    return 'Yesterday';
  }
  return formatDate(ms);
}

/** "25 Oct 2026, 3:05 PM" */
export function formatDateTime(ms) {
  return `${formatDate(ms)}, ${formatTime(ms)}`;
}

/** Keeps the time of `base` but takes the calendar date from `picked`. */
export function withDateFrom(base, picked) {
  const result = new Date(base);
  result.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
  return result;
}

/** Keeps the date of `base` but takes hours and minutes from `picked`. */
export function withTimeFrom(base, picked) {
  const result = new Date(base);
  result.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
  return result;
}
