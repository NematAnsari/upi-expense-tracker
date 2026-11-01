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

/** "1 Nov" this year, "1 Nov 2025" for another year. */
export function formatShortDate(ms, now = new Date()) {
  const date = new Date(ms);
  const dayMonth = `${date.getDate()} ${MONTH_NAMES[date.getMonth()].slice(0, 3)}`;
  return date.getFullYear() === now.getFullYear() ? dayMonth : `${dayMonth} ${date.getFullYear()}`;
}

/** "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "31st" */
function ordinal(day) {
  const lastTwo = day % 100;
  if (lastTwo >= 11 && lastTwo <= 13) {
    return `${day}th`;
  }
  return `${day}${{ 1: 'st', 2: 'nd', 3: 'rd' }[day % 10] ?? 'th'}`;
}

/** "31st Oct 2025" */
export function formatOrdinalDate(ms) {
  const date = new Date(ms);
  return `${ordinal(date.getDate())} ${MONTH_NAMES[date.getMonth()].slice(0, 3)} ${date.getFullYear()}`;
}

/** Whole calendar days from one date to another (time of day is ignored). */
export function daysBetween(fromMs, toMs) {
  // Rounding handles the 23 or 25 hour days around daylight saving changes.
  return Math.round((getDayRange(new Date(toMs)).startMs - getDayRange(new Date(fromMs)).startMs) / 86400000);
}

/**
 * How long from one date to another, in the largest whole unit:
 * "0 days", "1 day", "25 days", "1 month", "5 months", "1 year", "2 years".
 * Months follow the calendar: 12 Aug to 12 Oct is 2 months, to 11 Oct is 1 month.
 */
export function formatDuration(fromMs, toMs) {
  const from = new Date(fromMs);
  const to = new Date(toMs);
  const days = Math.max(daysBetween(fromMs, toMs), 0);
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) {
    months -= 1;
  }
  const count = (value, unit) => `${value} ${unit}${value === 1 ? '' : 's'}`;
  if (months >= 12) {
    return count(Math.floor(months / 12), 'year');
  }
  if (months >= 1) {
    return count(months, 'month');
  }
  return count(days, 'day');
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
