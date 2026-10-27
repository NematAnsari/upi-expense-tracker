// Spending calculations shared by the Dashboard and Reports screens.
// Only 'debit' rows are expenses. Incoming payments ('credit') are never counted.

import { getDayRange, getMonthRange, getWeekBuckets, shiftMonth } from '../utils/dates.js';
import { averagePaise, percentOf } from '../utils/money.js';
import { SELECT_TRANSACTION, listTransactions } from './transactions.js';

const IN_RANGE = "t.direction = 'debit' AND t.occurred_at >= ? AND t.occurred_at < ?";

export async function getSpendingTotals(db, startMs, endMs) {
  const row = await db.getFirstAsync(
    `SELECT COALESCE(SUM(t.amount_paise), 0) AS totalPaise, COUNT(*) AS count
     FROM transactions t WHERE ${IN_RANGE}`,
    [startMs, endMs],
  );
  return { totalPaise: row?.totalPaise ?? 0, count: row?.count ?? 0 };
}

/** Per-category totals, largest first, each with its share of the overall total. */
export async function getCategoryTotals(db, startMs, endMs) {
  const rows = await db.getAllAsync(
    `SELECT c.id AS categoryId, c.name AS categoryName,
            SUM(t.amount_paise) AS totalPaise, COUNT(*) AS count
     FROM transactions t
     JOIN categories c ON c.id = t.category_id
     WHERE ${IN_RANGE}
     GROUP BY c.id, c.name
     ORDER BY totalPaise DESC, c.name`,
    [startMs, endMs],
  );
  const overall = rows.reduce((sum, row) => sum + row.totalPaise, 0);
  return rows.map((row) => ({ ...row, percent: percentOf(row.totalPaise, overall) }));
}

export async function getHighestExpense(db, startMs, endMs) {
  return db.getFirstAsync(
    `${SELECT_TRANSACTION} WHERE ${IN_RANGE}
     ORDER BY t.amount_paise DESC, t.occurred_at DESC LIMIT 1`,
    [startMs, endMs],
  );
}

async function getWeeklyTotals(db, monthKey) {
  const { startMs, endMs } = getMonthRange(monthKey);
  const rows = await db.getAllAsync(
    `SELECT t.amount_paise AS amountPaise, t.occurred_at AS occurredAt
     FROM transactions t WHERE ${IN_RANGE}`,
    [startMs, endMs],
  );
  return getWeekBuckets(monthKey).map((bucket) => {
    const inBucket = rows.filter((row) => row.occurredAt >= bucket.startMs && row.occurredAt < bucket.endMs);
    return {
      label: bucket.label,
      totalPaise: inBucket.reduce((sum, row) => sum + row.amountPaise, 0),
      count: inBucket.length,
    };
  });
}

async function countMissingPurpose(db, startMs, endMs) {
  const row = await db.getFirstAsync(
    `SELECT COUNT(*) AS count FROM transactions t WHERE ${IN_RANGE} AND t.purpose IS NULL`,
    [startMs, endMs],
  );
  return row?.count ?? 0;
}

/** Money received (credits) in a range. Kept separate from spending. */
export async function getReceivedTotals(db, startMs, endMs) {
  const row = await db.getFirstAsync(
    `SELECT COALESCE(SUM(t.amount_paise), 0) AS totalPaise, COUNT(*) AS count
     FROM transactions t
     WHERE t.direction = 'credit' AND t.occurred_at >= ? AND t.occurred_at < ?`,
    [startMs, endMs],
  );
  return { totalPaise: row?.totalPaise ?? 0, count: row?.count ?? 0 };
}

export async function getDashboardData(db, monthKey, now = new Date()) {
  const month = getMonthRange(monthKey);
  const today = getDayRange(now);

  const [monthTotals, todayTotals, receivedTotals, categories, recent, missingPurposeCount] = await Promise.all([
    getSpendingTotals(db, month.startMs, month.endMs),
    getSpendingTotals(db, today.startMs, today.endMs),
    getReceivedTotals(db, month.startMs, month.endMs),
    getCategoryTotals(db, month.startMs, month.endMs),
    listTransactions(db, { startMs: month.startMs, endMs: month.endMs, limit: 5 }),
    countMissingPurpose(db, month.startMs, month.endMs),
  ]);

  return { monthTotals, todayTotals, receivedTotals, categories, recent, missingPurposeCount };
}

export async function getMonthlyReport(db, monthKey) {
  const month = getMonthRange(monthKey);
  const previousMonthKey = shiftMonth(monthKey, -1);
  const previous = getMonthRange(previousMonthKey);

  const [totals, previousTotals, received, categories, highest, weeks] = await Promise.all([
    getSpendingTotals(db, month.startMs, month.endMs),
    getSpendingTotals(db, previous.startMs, previous.endMs),
    getReceivedTotals(db, month.startMs, month.endMs),
    getCategoryTotals(db, month.startMs, month.endMs),
    getHighestExpense(db, month.startMs, month.endMs),
    getWeeklyTotals(db, monthKey),
  ]);

  const changePaise = totals.totalPaise - previousTotals.totalPaise;

  return {
    monthKey,
    totalPaise: totals.totalPaise,
    count: totals.count,
    receivedPaise: received.totalPaise,
    averagePaise: averagePaise(totals.totalPaise, totals.count),
    highest,
    categories,
    weeks,
    comparison: {
      previousMonthKey,
      previousTotalPaise: previousTotals.totalPaise,
      changePaise,
      // null when last month had no spending: a percentage change is meaningless then.
      changePercent: previousTotals.totalPaise > 0 ? percentOf(changePaise, previousTotals.totalPaise) : null,
    },
  };
}
