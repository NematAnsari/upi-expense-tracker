// Spending calculations shared by the Dashboard and Reports screens.
// Only 'debit' rows are expenses. Incoming payments ('credit') are never counted.
// Loans (money lent, borrowed or paid back) are neither spending nor income,
// so they are left out of both; see getLoanBalances for them.

import { describeBalance, maxReturnPaise, settlementDates } from '../domain/loans.js';
import { getDayRange, getMonthRange, getWeekBuckets, shiftMonth } from '../utils/dates.js';
import { averagePaise, formatINR, percentOf } from '../utils/money.js';
import { SELECT_TRANSACTION, listTransactions } from './transactions.js';

const IN_RANGE = "t.direction = 'debit' AND t.loan_type IS NULL AND t.occurred_at >= ? AND t.occurred_at < ?";

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
     WHERE t.direction = 'credit' AND t.loan_type IS NULL AND t.occurred_at >= ? AND t.occurred_at < ?`,
    [startMs, endMs],
  );
  return { totalPaise: row?.totalPaise ?? 0, count: row?.count ?? 0 };
}

// Net per person: above 0 they have money to return to you, below 0 you have money to return to them.
const NET_PAISE = `SUM(CASE loan_type
       WHEN 'lent' THEN amount_paise
       WHEN 'lent_repaid' THEN -amount_paise
       WHEN 'borrowed' THEN -amount_paise
       WHEN 'borrowed_repaid' THEN amount_paise
     END)`;

/**
 * One person's net amount (same rule and name matching as getLoanBalances),
 * leaving out one entry (the one being edited) when excludeId is given.
 */
export async function getPersonNetPaise(db, person, excludeId = null) {
  const row = await db.getFirstAsync(
    `SELECT COALESCE(${NET_PAISE}, 0) AS netPaise
     FROM transactions
     WHERE loan_type IS NOT NULL AND lower(trim(merchant)) = lower(trim(?)) AND id IS NOT ?`,
    [person, excludeId],
  );
  return row?.netPaise ?? 0;
}

/**
 * Money received back or returned cannot be more than the person's remaining
 * amount. Returns an error message for the amount field, or null when it is fine.
 * excludeId: the entry being edited, so its old amount is not counted twice.
 */
export async function checkReturnAmount(db, values, excludeId = null) {
  if (values.loanType !== 'lent_repaid' && values.loanType !== 'borrowed_repaid') {
    return null;
  }
  const netPaise = await getPersonNetPaise(db, values.merchant, excludeId);
  const maxPaise = maxReturnPaise(values.loanType, netPaise);
  if (values.amountPaise <= maxPaise) {
    return null;
  }
  if (maxPaise === 0) {
    return values.loanType === 'lent_repaid'
      ? `${values.merchant} has no money to return to you.`
      : `You have no money to return to ${values.merchant}.`;
  }
  return `Remaining amount is ${formatINR(maxPaise)}. Enter ${formatINR(maxPaise)} or less.`;
}

/**
 * Loan balance per person, from all time (loans do not belong to one month).
 * People are matched by name, ignoring case and spaces at the ends.
 * Returns { people: [{ person, netPaise, status, amountPaise, lastAt, count,
 *           givenPaise, receivedBackPaise, takenPaise, returnedPaise,
 *           openSinceAt, settledAt, settledFromAt }],
 *           owedToYouPaise, youOwePaise }.
 * openSinceAt / settledAt / settledFromAt: see settlementDates in domain/loans.js.
 * Settled people (net 0) are listed last.
 */
export async function getLoanBalances(db) {
  // With MAX(occurred_at), SQLite takes `merchant` (the spelling) from the latest entry.
  // `key` is the same lower(trim()) SQLite uses to group, so both queries match people alike.
  const rows = await db.getAllAsync(
    `SELECT
       lower(trim(merchant)) AS key,
       merchant AS person,
       ${NET_PAISE} AS netPaise,
       SUM(CASE WHEN loan_type = 'lent' THEN amount_paise ELSE 0 END) AS givenPaise,
       SUM(CASE WHEN loan_type = 'lent_repaid' THEN amount_paise ELSE 0 END) AS receivedBackPaise,
       SUM(CASE WHEN loan_type = 'borrowed' THEN amount_paise ELSE 0 END) AS takenPaise,
       SUM(CASE WHEN loan_type = 'borrowed_repaid' THEN amount_paise ELSE 0 END) AS returnedPaise,
       MAX(occurred_at) AS lastAt,
       COUNT(*) AS count
     FROM transactions
     WHERE loan_type IS NOT NULL AND merchant IS NOT NULL AND trim(merchant) <> ''
     GROUP BY lower(trim(merchant))`,
  );
  const entries = await db.getAllAsync(
    `SELECT id, lower(trim(merchant)) AS key, loan_type AS loanType, amount_paise AS amountPaise,
            occurred_at AS occurredAt
     FROM transactions
     WHERE loan_type IS NOT NULL AND merchant IS NOT NULL AND trim(merchant) <> ''`,
  );
  const entriesByKey = {};
  for (const entry of entries) {
    (entriesByKey[entry.key] ??= []).push(entry);
  }

  const people = rows
    .map(({ key, ...row }) => ({
      ...row,
      person: row.person.trim(),
      ...describeBalance(row.netPaise),
      ...settlementDates(entriesByKey[key] ?? []),
    }))
    .sort((a, b) => (a.status === 'settled') - (b.status === 'settled') || b.lastAt - a.lastAt);

  return {
    people,
    owedToYouPaise: people.filter((p) => p.status === 'owesYou').reduce((sum, p) => sum + p.amountPaise, 0),
    youOwePaise: people.filter((p) => p.status === 'youOwe').reduce((sum, p) => sum + p.amountPaise, 0),
  };
}

export async function getDashboardData(db, monthKey, now = new Date()) {
  const month = getMonthRange(monthKey);
  const today = getDayRange(now);

  const [monthTotals, todayTotals, receivedTotals, categories, recent, missingPurposeCount] = await Promise.all([
    getSpendingTotals(db, month.startMs, month.endMs),
    getSpendingTotals(db, today.startMs, today.endMs),
    getReceivedTotals(db, month.startMs, month.endMs),
    getCategoryTotals(db, month.startMs, month.endMs),
    // Expenses and income only: money given and taken has its own tab.
    listTransactions(db, { startMs: month.startMs, endMs: month.endMs, kind: 'regular', limit: 5 }),
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
