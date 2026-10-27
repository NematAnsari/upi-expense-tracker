import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_CATEGORIES } from '../src/constants/categories.js';
import { listCategories } from '../src/db/categories.js';
import { LATEST_VERSION, migrateDbIfNeeded } from '../src/db/migrations.js';
import { getDashboardData, getMonthlyReport } from '../src/db/reports.js';
import {
  createTransaction,
  deleteTransaction,
  getTransaction,
  listTransactions,
  updateTransaction,
} from '../src/db/transactions.js';
import { validateTransactionForm } from '../src/domain/validation.js';
import { createTestDatabase } from './helpers/testDatabase.js';

async function setup() {
  const { db, raw } = await createTestDatabase();
  const categories = await listCategories(db);
  const categoryId = (name) => categories.find((c) => c.name === name).id;

  async function add(amountText, categoryName, occurredAt, extra = {}) {
    const { values, errors } = validateTransactionForm(
      { amountText, categoryId: categoryId(categoryName), occurredAt, paymentMethod: 'UPI', ...extra },
      Date.UTC(2100, 0, 1),
    );
    assert.deepEqual(errors, {});
    return createTransaction(db, values);
  }
  return { db, raw, categoryId, add };
}

const oct = (day, hour = 12, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();

test('migration creates schema, seeds categories, and is safe to rerun', async () => {
  const { db, raw } = await setup();
  const categories = await listCategories(db);
  // Version 3 adds Income and Uncategorized after the defaults.
  assert.deepEqual(
    categories.map((c) => c.name),
    [...DEFAULT_CATEGORIES, 'Income', 'Uncategorized'],
  );
  assert.equal(raw.prepare('PRAGMA user_version').get().user_version, LATEST_VERSION);

  await migrateDbIfNeeded(db);
  assert.equal((await listCategories(db)).length, DEFAULT_CATEGORIES.length + 2);
});

test('database rejects bad data even if validation is bypassed', async () => {
  const { db, categoryId } = await setup();
  const base = {
    amountPaise: 100,
    purpose: null,
    categoryId: categoryId('Rent'),
    occurredAt: oct(1),
    paymentMethod: 'UPI',
    merchant: null,
    reference: null,
    notes: null,
  };
  await assert.rejects(createTransaction(db, { ...base, amountPaise: 0 }));
  await assert.rejects(createTransaction(db, { ...base, amountPaise: -5 }));
  await assert.rejects(createTransaction(db, { ...base, paymentMethod: 'Bitcoin' }));
  await assert.rejects(createTransaction(db, { ...base, categoryId: 9999 }), /FOREIGN KEY/);
});

test('create, read, update and delete a transaction', async () => {
  const { db, add, categoryId } = await setup();
  const id = await add('1,250.50', 'Groceries', oct(10), { purpose: '  Weekly veggies ', merchant: 'Local Mart' });

  const saved = await getTransaction(db, id);
  assert.equal(saved.amountPaise, 125050);
  assert.equal(saved.purpose, 'Weekly veggies');
  assert.equal(saved.categoryName, 'Groceries');
  assert.equal(saved.reference, null);

  await updateTransaction(db, id, {
    ...saved,
    amountPaise: 99900,
    categoryId: categoryId('Shopping'),
    notes: 'edited',
  });
  const updated = await getTransaction(db, id);
  assert.equal(updated.amountPaise, 99900);
  assert.equal(updated.categoryName, 'Shopping');
  assert.equal(updated.notes, 'edited');

  await deleteTransaction(db, id);
  assert.equal(await getTransaction(db, id), null);
  await assert.rejects(updateTransaction(db, id, updated), /no longer exists/);
});

test('monthly report: totals, categories, boundaries, deletes and credits', async () => {
  const { db, raw, add, categoryId } = await setup();

  // October 2026
  await add('500', 'Food & Dining', oct(1, 0, 0)); // first moment of the month
  await add('250.25', 'Food & Dining', oct(15));
  await add('1000', 'Groceries', oct(20));
  await add('0.10', 'Groceries', oct(21));
  await add('0.20', 'Groceries', oct(21));
  await add('3000', 'Rent', new Date(2026, 9, 31, 23, 59, 59, 999).getTime()); // last moment
  const deletedId = await add('7777', 'Shopping', oct(5));
  await deleteTransaction(db, deletedId);

  // Outside October
  await add('200', 'Rent', new Date(2026, 10, 1, 0, 0).getTime()); // November 1st, 00:00
  await add('1500', 'Health', new Date(2026, 8, 30, 23, 59).getTime()); // September 30th

  // An incoming payment must never count as an expense.
  raw
    .prepare(
      `INSERT INTO transactions (amount_paise, direction, category_id, occurred_at, payment_method, created_at, updated_at)
               VALUES (999999, 'credit', ?, ?, 'UPI', 0, 0)`,
    )
    .run(categoryId('Transfers'), oct(12));

  const report = await getMonthlyReport(db, '2026-10');
  const expectedTotal = 50000 + 25025 + 100000 + 10 + 20 + 300000;
  assert.equal(report.totalPaise, expectedTotal); // ₹4,750.55
  assert.equal(report.count, 6);
  assert.equal(report.averagePaise, Math.round(expectedTotal / 6));
  assert.equal(report.highest.amountPaise, 300000);
  assert.equal(report.highest.categoryName, 'Rent');

  assert.deepEqual(
    report.categories.map((c) => [c.categoryName, c.totalPaise, c.count]),
    [
      ['Rent', 300000, 1],
      ['Groceries', 100030, 3],
      ['Food & Dining', 75025, 2],
    ],
  );
  const categorySum = report.categories.reduce((sum, c) => sum + c.totalPaise, 0);
  assert.equal(categorySum, report.totalPaise);
  const percentSum = report.categories.reduce((sum, c) => sum + c.percent, 0);
  assert.ok(Math.abs(percentSum - 100) < 1e-9);

  const weekSum = report.weeks.reduce((sum, w) => sum + w.totalPaise, 0);
  assert.equal(weekSum, report.totalPaise);
  assert.equal(report.weeks[0].totalPaise, 50000);
  assert.equal(report.weeks.at(-1).totalPaise, 300000);

  assert.equal(report.comparison.previousMonthKey, '2026-09');
  assert.equal(report.comparison.previousTotalPaise, 150000);
  assert.equal(report.comparison.changePaise, expectedTotal - 150000);
  assert.ok(Math.abs(report.comparison.changePercent - ((expectedTotal - 150000) * 100) / 150000) < 1e-9);

  const november = await getMonthlyReport(db, '2026-11');
  assert.equal(november.totalPaise, 20000);
  assert.equal(november.count, 1);
});

test('empty month report has zeros and no percentage change', async () => {
  const { db } = await setup();
  const report = await getMonthlyReport(db, '2026-10');
  assert.equal(report.totalPaise, 0);
  assert.equal(report.count, 0);
  assert.equal(report.averagePaise, 0);
  assert.equal(report.highest, null);
  assert.deepEqual(report.categories, []);
  assert.ok(report.weeks.every((w) => w.totalPaise === 0));
  assert.equal(report.comparison.changePercent, null);
});

test('dashboard data: month, today and five most recent', async () => {
  const { db, add } = await setup();
  for (let day = 1; day <= 7; day += 1) {
    await add(String(day * 100), 'Food & Dining', oct(day));
  }
  await add('50', 'Groceries', oct(25, 9));
  await add('25', 'Groceries', oct(25, 18));
  await add('999', 'Groceries', oct(26, 0, 0)); // tomorrow, not today

  const data = await getDashboardData(db, '2026-10', new Date(2026, 9, 25, 20, 0));
  assert.equal(data.todayTotals.totalPaise, 7500);
  assert.equal(data.todayTotals.count, 2);
  assert.equal(data.monthTotals.count, 10);
  assert.equal(data.recent.length, 5);
  assert.equal(data.recent[0].amountPaise, 99900); // newest first
});

test('history filters: search, category, month and sort order', async () => {
  const { db, add, categoryId } = await setup();
  await add('100', 'Food & Dining', oct(3), { purpose: 'Lunch with team', merchant: 'Cafe 100%' });
  await add('200', 'Groceries', oct(4), { merchant: 'Fresh_Mart' });
  await add('300', 'Food & Dining', new Date(2026, 8, 9).getTime(), { purpose: 'Dinner' });

  const { startMs, endMs } = { startMs: oct(1, 0), endMs: new Date(2026, 10, 1).getTime() };

  assert.equal((await listTransactions(db, { search: 'LUNCH' })).length, 1);
  assert.equal((await listTransactions(db, { search: 'fresh' })).length, 1);
  assert.equal((await listTransactions(db, { search: '100%' })).length, 1, '% is literal, not a wildcard');
  assert.equal((await listTransactions(db, { search: '_' })).length, 1, '_ is literal, not a wildcard');
  assert.equal((await listTransactions(db, { categoryId: categoryId('Food & Dining') })).length, 2);
  assert.equal((await listTransactions(db, { startMs, endMs })).length, 2);
  assert.equal(
    (await listTransactions(db, { startMs, endMs, categoryId: categoryId('Food & Dining'), search: 'lunch' })).length,
    1,
  );

  const newestFirst = await listTransactions(db, {});
  const oldestFirst = await listTransactions(db, { sort: 'asc' });
  assert.deepEqual(
    newestFirst.map((t) => t.amountPaise),
    [20000, 10000, 30000],
  );
  assert.deepEqual(
    oldestFirst.map((t) => t.amountPaise),
    [30000, 10000, 20000],
  );
});

test('form validation messages', () => {
  const now = new Date(2026, 9, 25, 12).getTime();
  const { errors, values } = validateTransactionForm(
    { amountText: '0', categoryId: null, paymentMethod: 'Crypto', occurredAt: now + 3600 * 1000 },
    now,
  );
  assert.equal(values, null);
  assert.ok(errors.amount && errors.category && errors.paymentMethod && errors.occurredAt);

  const ok = validateTransactionForm(
    { amountText: '45', categoryId: 1, paymentMethod: 'Cash', occurredAt: now, purpose: '   ', notes: ' tea ' },
    now,
  );
  assert.deepEqual(ok.errors, {});
  assert.equal(ok.values.purpose, null);
  assert.equal(ok.values.notes, 'tea');
});
