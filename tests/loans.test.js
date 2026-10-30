import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { listCategories } from '../src/db/categories.js';
import { LATEST_VERSION, MIGRATIONS, migrateDbIfNeeded } from '../src/db/migrations.js';
import { getDashboardData, getLoanBalances, getMonthlyReport } from '../src/db/reports.js';
import { createTransaction, listTransactions } from '../src/db/transactions.js';
import { describeBalance, isValidLoanType, loanChoicesFor } from '../src/domain/loans.js';
import { categoryIdForSave, pickableCategories } from '../src/domain/transactionForm.js';
import { validateTransactionForm } from '../src/domain/validation.js';
import { createTestDatabase, wrapDatabase } from './helpers/testDatabase.js';

const oct = (day, hour = 12) => new Date(2026, 9, day, hour).getTime();

async function setup() {
  const { db } = await createTestDatabase();
  const categories = await listCategories(db);
  const id = (name) => categories.find((c) => c.name === name).id;

  function add(amountPaise, direction, { loanType = null, merchant = null, category = 'Other', day = 10 } = {}) {
    return createTransaction(db, {
      amountPaise,
      direction,
      loanType,
      merchant,
      categoryId: id(loanType ? 'Loans' : category),
      occurredAt: oct(day),
      paymentMethod: 'UPI',
      purpose: null,
      reference: null,
      notes: null,
    });
  }
  return { db, categories, add };
}

test('upgrading a version 3 database keeps data and adds loans support', async () => {
  const raw = new DatabaseSync(':memory:');
  const db = wrapDatabase(raw);
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const migrate of MIGRATIONS.slice(0, 3)) {
      await migrate(txn);
    }
    await txn.execAsync('PRAGMA user_version = 3');
  });
  const rent = (await db.getFirstAsync("SELECT id FROM categories WHERE name = 'Rent'")).id;
  await db.runAsync(
    `INSERT INTO transactions (amount_paise, purpose, category_id, occurred_at, payment_method, created_at, updated_at)
     VALUES (500000, 'Rent', ?, ?, 'UPI', 0, 0)`,
    [rent, oct(1)],
  );

  await migrateDbIfNeeded(db);
  assert.equal(raw.prepare('PRAGMA user_version').get().user_version, LATEST_VERSION);
  const [row] = await listTransactions(db);
  assert.equal(row.amountPaise, 500000);
  assert.equal(row.loanType, null);
  assert.ok((await listCategories(db)).some((c) => c.name === 'Loans'));
  assert.throws(() => raw.prepare("UPDATE transactions SET loan_type = 'gift'").run(), /CHECK/);
});

test('loans are not counted as spending or income', async () => {
  const { db, add } = await setup();
  await add(30000, 'debit', { category: 'Food & Dining' }); // real expense ₹300
  await add(100000, 'credit', { category: 'Income' }); // real income ₹1,000
  await add(50000, 'debit', { loanType: 'lent', merchant: 'Ravi' }); // lent ₹500
  await add(20000, 'credit', { loanType: 'borrowed', merchant: 'Amit' }); // borrowed ₹200
  await add(10000, 'credit', { loanType: 'lent_repaid', merchant: 'Ravi' }); // Ravi paid back ₹100

  const report = await getMonthlyReport(db, '2026-10');
  assert.equal(report.totalPaise, 30000);
  assert.equal(report.count, 1);
  assert.equal(report.receivedPaise, 100000);
  assert.deepEqual(
    report.categories.map((c) => c.categoryName),
    ['Food & Dining'],
  );

  const dashboard = await getDashboardData(db, '2026-10', new Date(2026, 9, 10, 20));
  assert.equal(dashboard.monthTotals.totalPaise, 30000);
  assert.equal(dashboard.todayTotals.totalPaise, 30000);
  assert.equal(dashboard.receivedTotals.totalPaise, 100000);
  assert.equal(dashboard.missingPurposeCount, 1, 'only the real expense needs a purpose');
  assert.equal(dashboard.recent.length, 5, 'loans still show in the latest list');

  assert.equal((await listTransactions(db, { loansOnly: true })).length, 3);
});

test('loan balances per person, matched by name ignoring case and spaces', async () => {
  const { db, add } = await setup();
  await add(50000, 'debit', { loanType: 'lent', merchant: 'Ravi', day: 1 });
  await add(20000, 'credit', { loanType: 'lent_repaid', merchant: ' ravi ', day: 5 });
  await add(30000, 'credit', { loanType: 'borrowed', merchant: 'Amit', day: 3 });
  await add(10000, 'debit', { loanType: 'borrowed_repaid', merchant: 'AMIT', day: 4 });
  await add(15000, 'debit', { loanType: 'lent', merchant: 'Sara', day: 2 });
  await add(15000, 'credit', { loanType: 'lent_repaid', merchant: 'Sara', day: 6 });
  await add(99900, 'debit', { category: 'Shopping', merchant: 'Ravi' }); // not a loan

  const balances = await getLoanBalances(db);
  const byName = Object.fromEntries(balances.people.map((p) => [p.person.toLowerCase(), p]));
  assert.deepEqual([byName.ravi.status, byName.ravi.amountPaise], ['owesYou', 30000]);
  assert.deepEqual([byName.amit.status, byName.amit.amountPaise], ['youOwe', 20000]);
  assert.deepEqual([byName.sara.status, byName.sara.amountPaise], ['settled', 0]);
  assert.equal(byName.ravi.person, 'ravi', 'latest spelling, trimmed');
  assert.equal(balances.owedToYouPaise, 30000);
  assert.equal(balances.youOwePaise, 20000);
  assert.equal(balances.people.at(-1).status, 'settled', 'settled people are listed last');
});

test('loan validation: direction must match and the person is required', () => {
  const now = oct(10);
  const base = { amountText: '500', categoryId: 1, paymentMethod: 'UPI', occurredAt: now };

  assert.ok(
    validateTransactionForm({ ...base, direction: 'credit', loanType: 'lent', merchant: 'Ravi' }, now).errors.loanType,
  );
  assert.match(
    validateTransactionForm({ ...base, direction: 'debit', loanType: 'lent', merchant: '  ' }, now).errors.merchant,
    /person's name/,
  );
  const ok = validateTransactionForm({ ...base, direction: 'debit', loanType: 'lent', merchant: ' Ravi ' }, now);
  assert.deepEqual(ok.errors, {});
  assert.equal(ok.values.loanType, 'lent');
  assert.equal(ok.values.merchant, 'Ravi');

  const normal = validateTransactionForm({ ...base, direction: 'debit' }, now);
  assert.equal(normal.values.loanType, null);
  assert.equal(isValidLoanType('borrowed', 'credit'), true);
  assert.equal(isValidLoanType('borrowed', 'debit'), false);
});

test('loan choices, Loans category handling and balance wording', async () => {
  const { categories } = await setup();
  assert.deepEqual(
    loanChoicesFor('debit').map((c) => c.label),
    ['Expense', 'Lent', 'Paid back'],
  );
  assert.deepEqual(
    loanChoicesFor('credit').map((c) => c.label),
    ['Income', 'Borrowed', 'Got paid back'],
  );

  assert.ok(!pickableCategories(categories).some((c) => c.name === 'Loans'));
  const loansId = categories.find((c) => c.name === 'Loans').id;
  assert.equal(categoryIdForSave({ loanType: 'lent', categoryId: 3 }, categories), loansId);
  assert.equal(categoryIdForSave({ loanType: null, categoryId: 3 }, categories), 3);

  assert.deepEqual(describeBalance(500), { status: 'owesYou', amountPaise: 500 });
  assert.deepEqual(describeBalance(-500), { status: 'youOwe', amountPaise: 500 });
  assert.deepEqual(describeBalance(0), { status: 'settled', amountPaise: 0 });
});
