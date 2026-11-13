// Spending and income totals for the Expenses and Reports tabs. Money given
// or taken and shop payments are never counted (see IS_SPENDING in sql.js).

import { getDayRange, getMonthRange, getWeeksOfMonth, shiftMonth } from '../utils/dates.js';
import { averagePaise, percentOf } from '../utils/money.js';
import { IS_INCOME, IS_SPENDING, NEEDS_PURPOSE } from './sql.js';
import { SELECT_TRANSACTION } from './transactions.js';

const IN_RANGE = 't.occurred_at >= ? AND t.occurred_at < ?';

/** { totalPaise, count } of spending in a time range. */
export async function getSpendingTotals(db, startMs, endMs) {
  const row = await db.getFirstAsync(
    `SELECT COALESCE(SUM(t.amount_paise), 0) AS totalPaise, COUNT(*) AS count
     FROM transactions t WHERE ${IS_SPENDING} AND ${IN_RANGE}`,
    [startMs, endMs],
  );
  return { totalPaise: row?.totalPaise ?? 0, count: row?.count ?? 0 };
}

/** { totalPaise, count } of income in a time range. */
async function getIncomeTotals(db, startMs, endMs) {
  const row = await db.getFirstAsync(
    `SELECT COALESCE(SUM(t.amount_paise), 0) AS totalPaise, COUNT(*) AS count
     FROM transactions t WHERE ${IS_INCOME} AND ${IN_RANGE}`,
    [startMs, endMs],
  );
  return { totalPaise: row?.totalPaise ?? 0, count: row?.count ?? 0 };
}

/** Spending per category, largest first, each with its share of the total. */
async function getCategoryTotals(db, startMs, endMs) {
  const rows = await db.getAllAsync(
    `SELECT c.id AS categoryId, c.name AS categoryName, SUM(t.amount_paise) AS totalPaise, COUNT(*) AS count
     FROM transactions t
     JOIN categories c ON c.id = t.category_id
     WHERE ${IS_SPENDING} AND ${IN_RANGE}
     GROUP BY c.id, c.name
     ORDER BY totalPaise DESC, c.name`,
    [startMs, endMs],
  );
  const overall = rows.reduce((sum, row) => sum + row.totalPaise, 0);
  return rows.map((row) => ({ ...row, percent: percentOf(row.totalPaise, overall) }));
}

async function getHighestExpense(db, startMs, endMs) {
  return db.getFirstAsync(
    `${SELECT_TRANSACTION} WHERE ${IS_SPENDING} AND ${IN_RANGE}
     ORDER BY t.amount_paise DESC, t.occurred_at DESC LIMIT 1`,
    [startMs, endMs],
  );
}

/** Spending per week of the month: [{ label, totalPaise, count }]. */
async function getWeeklyTotals(db, monthKey) {
  const { startMs, endMs } = getMonthRange(monthKey);
  const rows = await db.getAllAsync(
    `SELECT t.amount_paise AS amountPaise, t.occurred_at AS occurredAt
     FROM transactions t WHERE ${IS_SPENDING} AND ${IN_RANGE}`,
    [startMs, endMs],
  );
  return getWeeksOfMonth(monthKey).map((week) => {
    const inWeek = rows.filter((row) => row.occurredAt >= week.startMs && row.occurredAt < week.endMs);
    return {
      label: week.label,
      totalPaise: inWeek.reduce((sum, row) => sum + row.amountPaise, 0),
      count: inWeek.length,
    };
  });
}

async function countMissingPurpose(db, startMs, endMs) {
  const row = await db.getFirstAsync(
    `SELECT COUNT(*) AS count FROM transactions t WHERE ${NEEDS_PURPOSE} AND ${IN_RANGE}`,
    [startMs, endMs],
  );
  return row?.count ?? 0;
}

/** The Expenses tab's numbers: the month's and today's spending and income, and expenses missing a purpose. */
export async function getDashboardData(db, monthKey, now = new Date()) {
  const month = getMonthRange(monthKey);
  const today = getDayRange(now);
  const [monthTotals, todayTotals, receivedTotals, todayReceived, missingPurposeCount] = await Promise.all([
    getSpendingTotals(db, month.startMs, month.endMs),
    getSpendingTotals(db, today.startMs, today.endMs),
    getIncomeTotals(db, month.startMs, month.endMs),
    getIncomeTotals(db, today.startMs, today.endMs),
    countMissingPurpose(db, month.startMs, month.endMs),
  ]);
  return { monthTotals, todayTotals, receivedTotals, todayReceived, missingPurposeCount };
}

/** Everything the Reports tab shows for one month, with last month for comparison. */
export async function getMonthlyReport(db, monthKey) {
  const month = getMonthRange(monthKey);
  const previousMonthKey = shiftMonth(monthKey, -1);
  const previous = getMonthRange(previousMonthKey);

  const [totals, previousTotals, received, categories, highest, weeks] = await Promise.all([
    getSpendingTotals(db, month.startMs, month.endMs),
    getSpendingTotals(db, previous.startMs, previous.endMs),
    getIncomeTotals(db, month.startMs, month.endMs),
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
    receivedCount: received.count,
    averagePaise: averagePaise(totals.totalPaise, totals.count),
    highest,
    categories,
    weeks,
    comparison: {
      previousMonthKey,
      previousTotalPaise: previousTotals.totalPaise,
      changePaise,
      // No percent when last month had no spending.
      changePercent: previousTotals.totalPaise > 0 ? percentOf(changePaise, previousTotals.totalPaise) : null,
    },
  };
}
