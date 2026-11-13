// Times are stored as milliseconds. Months and days follow the phone's own
// time zone, so an expense at 11:30 PM on the 31st stays in that month.

import { plural } from './text.js';

export const MONTH_NAMES = [
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

/** "Oct" for month number 10. */
function shortMonth(monthNumber) {
  return MONTH_NAMES[monthNumber - 1].slice(0, 3);
}

/** "2026-11" from a year and a month number (1-12). */
export function makeMonthKey(year, month) {
  return `${year}-${pad2(month)}`;
}

/** "2026-11" for the month of a date. */
export function getMonthKey(date = new Date()) {
  return makeMonthKey(date.getFullYear(), date.getMonth() + 1);
}

/** "2026-11-04": the day of a time, by the phone's calendar. */
export function getDayKey(ms) {
  const date = new Date(ms);
  return `${getMonthKey(date)}-${pad2(date.getDate())}`;
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

/** "November 2026" */
export function formatMonthLabel(monthKey) {
  const { year, month } = parseMonthKey(monthKey);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/** "Nov" */
export function formatShortMonth(monthKey) {
  return shortMonth(parseMonthKey(monthKey).month);
}

/** Start (inclusive) and end (exclusive) of the local day containing the date. */
export function getDayRange(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return { startMs: start.getTime(), endMs: end.getTime() };
}

/** A month in weeks of days 1-7, 8-14, 15-21, 22-28 and 29 to the end. */
export function getWeeksOfMonth(monthKey) {
  const { year, month } = parseMonthKey(monthKey);
  const daysInMonth = new Date(year, month, 0).getDate();
  const buckets = [];

  for (let firstDay = 1; firstDay <= daysInMonth; firstDay += 7) {
    const lastDay = Math.min(firstDay + 6, daysInMonth);
    buckets.push({
      label: `${firstDay}-${lastDay} ${shortMonth(month)}`,
      startMs: new Date(year, month - 1, firstDay).getTime(),
      endMs: new Date(year, month - 1, lastDay + 1).getTime(),
    });
  }
  return buckets;
}

/** "25 Oct 2026" */
function formatDate(ms) {
  const date = new Date(ms);
  return `${date.getDate()} ${shortMonth(date.getMonth() + 1)} ${date.getFullYear()}`;
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
  const dayMonth = `${date.getDate()} ${shortMonth(date.getMonth() + 1)}`;
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
  return `${ordinal(date.getDate())} ${shortMonth(date.getMonth() + 1)} ${date.getFullYear()}`;
}

/** Whole calendar days from one date to another; the time of day does not count. */
export function daysBetween(fromMs, toMs) {
  // Rounding covers 23 or 25 hour days when clocks change.
  return Math.round((getDayRange(new Date(toMs)).startMs - getDayRange(new Date(fromMs)).startMs) / 86400000);
}

/**
 * How long from one date to another, in the largest whole unit: "0 days",
 * "25 days", "1 month", "2 years". 12 Aug to 12 Oct is 2 months; to 11 Oct, 1.
 */
export function formatDuration(fromMs, toMs) {
  const from = new Date(fromMs);
  const to = new Date(toMs);
  const days = Math.max(daysBetween(fromMs, toMs), 0);
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) {
    months -= 1;
  }
  if (months >= 12) {
    return plural(Math.floor(months / 12), 'year', 'years');
  }
  if (months >= 1) {
    return plural(months, 'month', 'months');
  }
  return plural(days, 'day', 'days');
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
