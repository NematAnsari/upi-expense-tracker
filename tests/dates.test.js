import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  formatDateTime,
  formatDayLabel,
  formatMonthLabel,
  getDayRange,
  getMonthKey,
  getMonthRange,
  getWeekBuckets,
  isCurrentOrFutureMonth,
  shiftMonth,
  withDateFrom,
  withTimeFrom,
} from '../src/utils/dates.js';

test('month keys and labels', () => {
  assert.equal(getMonthKey(new Date(2026, 0, 31, 23, 59)), '2026-01');
  assert.equal(getMonthKey(new Date(2026, 11, 1)), '2026-12');
  assert.equal(formatMonthLabel('2026-10'), 'October 2026');
});

test('shifting months crosses year boundaries', () => {
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2025-12', 1), '2026-01');
  assert.equal(shiftMonth('2026-03', -12), '2025-03');
});

test('month range covers exactly the local month', () => {
  const { startMs, endMs } = getMonthRange('2026-10');
  assert.equal(startMs, new Date(2026, 9, 1).getTime());
  assert.equal(endMs, new Date(2026, 10, 1).getTime());

  const lastMoment = new Date(2026, 9, 31, 23, 59, 59, 999).getTime();
  assert.ok(lastMoment >= startMs && lastMoment < endMs);
  assert.equal(getMonthRange('2026-11').startMs, endMs, 'next month starts exactly where this one ends');
});

test('day range is local midnight to midnight', () => {
  const { startMs, endMs } = getDayRange(new Date(2026, 9, 25, 15, 30));
  assert.equal(startMs, new Date(2026, 9, 25).getTime());
  assert.equal(endMs, new Date(2026, 9, 26).getTime());
});

test('week buckets cover the whole month with no gaps', () => {
  for (const monthKey of ['2026-02', '2028-02', '2026-04', '2026-10']) {
    const buckets = getWeekBuckets(monthKey);
    const { startMs, endMs } = getMonthRange(monthKey);
    assert.equal(buckets[0].startMs, startMs);
    assert.equal(buckets.at(-1).endMs, endMs);
    for (let i = 1; i < buckets.length; i += 1) {
      assert.equal(buckets[i].startMs, buckets[i - 1].endMs);
    }
  }
  assert.equal(getWeekBuckets('2026-02').length, 4); // 28 days
  assert.equal(getWeekBuckets('2028-02').at(-1).label, '29-29 Feb'); // leap year
  assert.equal(getWeekBuckets('2026-10').at(-1).label, '29-31 Oct');
});

test('current or future month check', () => {
  const now = new Date(2026, 9, 25);
  assert.equal(isCurrentOrFutureMonth('2026-10', now), true);
  assert.equal(isCurrentOrFutureMonth('2026-11', now), true);
  assert.equal(isCurrentOrFutureMonth('2026-09', now), false);
});

test('formats date and time in 12-hour local time', () => {
  assert.equal(formatDateTime(new Date(2026, 9, 25, 15, 5).getTime()), '25 Oct 2026, 3:05 PM');
  assert.equal(formatDateTime(new Date(2026, 0, 1, 0, 0).getTime()), '1 Jan 2026, 12:00 AM');
  assert.equal(formatDateTime(new Date(2026, 0, 1, 12, 30).getTime()), '1 Jan 2026, 12:30 PM');
});

test('day labels: Today, Yesterday, then dates (month and year boundaries)', () => {
  const now = new Date(2026, 10, 1, 9, 0); // 1 Nov 2026
  assert.equal(formatDayLabel(new Date(2026, 10, 1, 0, 0).getTime(), now), 'Today');
  assert.equal(formatDayLabel(new Date(2026, 9, 31, 23, 59).getTime(), now), 'Yesterday');
  assert.equal(formatDayLabel(new Date(2026, 9, 30, 12, 0).getTime(), now), '30 Oct 2026');
  assert.equal(formatDayLabel(new Date(2026, 0, 1).getTime(), new Date(2026, 0, 1, 12)), 'Today');
  assert.equal(formatDayLabel(new Date(2025, 11, 31).getTime(), new Date(2026, 0, 1, 12)), 'Yesterday');
});

test('combines picked date and time without losing the other part', () => {
  const base = new Date(2026, 9, 25, 15, 5);
  assert.equal(withDateFrom(base, new Date(2026, 8, 3, 9, 0)).getTime(), new Date(2026, 8, 3, 15, 5).getTime());
  assert.equal(withTimeFrom(base, new Date(2000, 0, 1, 8, 45)).getTime(), new Date(2026, 9, 25, 8, 45).getTime());
});
