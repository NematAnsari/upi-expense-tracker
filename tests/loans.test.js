import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { listCategories } from '../src/db/categories.js';
import { LATEST_VERSION, MIGRATIONS, migrateDbIfNeeded } from '../src/db/migrations.js';
import { checkReturnAmount, getDashboardData, getLoanBalances, getMonthlyReport } from '../src/db/reports.js';
import { createTransaction, listTransactions } from '../src/db/transactions.js';
import {
  activityTitle,
  balanceParts,
  describeBalance,
  isValidLoanType,
  loanChoicesFor,
  personLists,
  repaymentFor,
} from '../src/domain/loans.js';
import { activityFor, categoryIdForSave, pickableCategories } from '../src/domain/transactionForm.js';
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
  assert.equal(dashboard.recent.length, 2, 'the Expenses tab lists expenses and income only');

  assert.equal((await listTransactions(db, { loansOnly: true })).length, 3);

  // History chips: Paid and Received leave money given and taken out.
  const kinds = async (kind) => (await listTransactions(db, { kind })).map((t) => t.amountPaise);
  assert.deepEqual(await kinds('paid'), [30000]);
  assert.deepEqual(await kinds('received'), [100000]);
  assert.deepEqual((await kinds('given')).sort(), [10000, 50000]); // gave + received back
  assert.deepEqual(await kinds('taken'), [20000]);
  assert.equal((await listTransactions(db, {})).length, 5);
});

test('row titles say what happened in plain words', () => {
  const row = (fields) => activityTitle({ direction: 'debit', loanType: null, categoryName: 'Other', ...fields });
  assert.equal(row({ merchant: 'XYZ Store' }), 'Paid to XYZ Store');
  assert.equal(row({ direction: 'credit', merchant: 'Rahul' }), 'Received from Rahul');
  assert.equal(row({ loanType: 'lent', merchant: 'Amit' }), 'Gave money to Amit');
  assert.equal(row({ direction: 'credit', loanType: 'borrowed', merchant: 'Sameer' }), 'Took money from Sameer');
  assert.equal(
    row({ direction: 'credit', loanType: 'lent_repaid', merchant: 'Rahul' }),
    'Money received back from Rahul',
  );
  assert.equal(row({ loanType: 'borrowed_repaid', merchant: 'Amit' }), 'Money returned to Amit');
  assert.equal(row({ purpose: 'Tea' }), 'Tea', 'no name: the purpose');
  assert.equal(row({}), 'Other', 'no name or purpose: the category');
  assert.equal(row({ loanType: 'lent', categoryName: 'Loans' }), 'Gave money', 'never the internal category');
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

  // One person's entries, matched the same way (the person screen uses this).
  const ravi = await listTransactions(db, { loansOnly: true, person: 'Ravi' });
  assert.deepEqual(
    ravi.map((t) => t.loanType),
    ['lent_repaid', 'lent'],
  );
});

test('per-person totals and the remaining-amount check for money back', async () => {
  const { db, add } = await setup();
  await add(500000, 'debit', { loanType: 'lent', merchant: 'Rahul', day: 1 }); // gave ₹5,000
  const backId = await add(200000, 'credit', { loanType: 'lent_repaid', merchant: 'rahul', day: 2 }); // ₹2,000 back
  await add(1000000, 'credit', { loanType: 'borrowed', merchant: 'Amit', day: 3 }); // took ₹10,000

  const rahul = (await getLoanBalances(db)).people.find((p) => p.person.toLowerCase() === 'rahul');
  assert.deepEqual(
    [rahul.givenPaise, rahul.receivedBackPaise, rahul.takenPaise, rahul.returnedPaise, rahul.amountPaise],
    [500000, 200000, 0, 0, 300000],
  );
  assert.deepEqual(
    balanceParts(rahul).map((part) => part.label),
    ['Total given', 'Received back'],
  );

  // Given & Taken tab lists: an open amount decides; settled people go where they had entries.
  assert.deepEqual(personLists(rahul), ['given']);
  assert.deepEqual(personLists({ status: 'youOwe' }), ['taken']);
  assert.deepEqual(personLists({ status: 'settled', givenPaise: 100, takenPaise: 0 }), ['given']);
  assert.deepEqual(personLists({ status: 'settled', givenPaise: 100, takenPaise: 50 }), ['given', 'taken']);

  const money = (paise, loanType, merchant) => ({ amountPaise: paise, loanType, merchant });
  // Up to the remaining amount is fine, partial amounts too.
  assert.equal(await checkReturnAmount(db, money(300000, 'lent_repaid', 'Rahul')), null);
  assert.equal(await checkReturnAmount(db, money(100, 'lent_repaid', 'Rahul')), null);
  // More than remaining is blocked.
  assert.match(await checkReturnAmount(db, money(300001, 'lent_repaid', 'Rahul')), /Remaining amount is ₹3,000\.00/);
  // Wrong side: Rahul has nothing for you to return.
  assert.match(await checkReturnAmount(db, money(100, 'borrowed_repaid', 'Rahul')), /no money to return to Rahul/);
  assert.equal(await checkReturnAmount(db, money(1000000, 'borrowed_repaid', 'Amit')), null);
  assert.match(await checkReturnAmount(db, money(100, 'lent_repaid', 'Nobody')), /no money to return to you/);
  // Editing an entry leaves its old amount out: ₹2,000 can become ₹5,000, not more.
  assert.equal(await checkReturnAmount(db, money(500000, 'lent_repaid', 'Rahul'), backId), null);
  assert.ok(await checkReturnAmount(db, money(500001, 'lent_repaid', 'Rahul'), backId));
  // Other kinds are never limited.
  assert.equal(await checkReturnAmount(db, money(99999999, 'lent', 'Rahul')), null);
  assert.equal(await checkReturnAmount(db, money(99999999, null, 'Rahul')), null);
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
    ['Expense', 'I gave money', 'Money returned'],
  );
  assert.deepEqual(
    loanChoicesFor('credit').map((c) => c.label),
    ['Income', 'I took money', 'Money received back'],
  );
  assert.equal(repaymentFor('owesYou'), 'lent_repaid');
  assert.equal(repaymentFor('youOwe'), 'borrowed_repaid');
  assert.equal(repaymentFor('settled'), null);

  assert.ok(!pickableCategories(categories).some((c) => c.name === 'Loans'));
  const loansId = categories.find((c) => c.name === 'Loans').id;
  assert.equal(categoryIdForSave({ loanType: 'lent', categoryId: 3 }, categories), loansId);
  assert.equal(categoryIdForSave({ loanType: null, categoryId: 3 }, categories), 3);

  // "What happened?" answers map to direction + loan type; returns are not among them.
  assert.equal(activityFor({ direction: 'debit', loanType: null }).key, 'paid');
  assert.equal(activityFor({ direction: 'credit', loanType: null }).key, 'received');
  assert.equal(activityFor({ direction: 'debit', loanType: 'lent' }).key, 'gave');
  assert.equal(activityFor({ direction: 'credit', loanType: 'borrowed' }).key, 'took');
  assert.equal(activityFor({}).key, 'paid', 'a new form starts as money paid');
  assert.equal(activityFor({ direction: 'credit', loanType: 'lent_repaid' }), null);

  assert.deepEqual(describeBalance(500), { status: 'owesYou', amountPaise: 500 });
  assert.deepEqual(describeBalance(-500), { status: 'youOwe', amountPaise: 500 });
  assert.deepEqual(describeBalance(0), { status: 'settled', amountPaise: 0 });
});
