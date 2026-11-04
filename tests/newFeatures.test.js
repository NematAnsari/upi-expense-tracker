// Split payment, remembered names, return-by date and backup / restore.
// Made-up names and messages, not real data.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildBackup, checkBackup, restoreBackup } from '../src/db/backup.js';
import { listCategories } from '../src/db/categories.js';
import {
  addDetectedAsTransaction,
  detectedToTransaction,
  rememberEditedName,
  listPendingDetected,
  syncCapturedNotifications,
  undoAddDetected,
} from '../src/db/detected.js';
import { getLoanBalances, getSpendingTotals } from '../src/db/reports.js';
import {
  createSplitPayment,
  createTransaction,
  listTransactions,
  renamePerson,
  updateTransaction,
} from '../src/db/transactions.js';
import { dueText } from '../src/domain/loans.js';
import { previewMyShare, validateSplits } from '../src/domain/split.js';
import { validateTransactionForm } from '../src/domain/validation.js';
import { createTestDatabase } from './helpers/testDatabase.js';

const posted = new Date(2026, 10, 4, 10, 0).getTime();
const DEBIT = (ref) =>
  `Rs.1000.00 debited A/cXX2222 and credited to TEST PERSON K via UPI Ref No ${ref} on 04Nov26. Call 18000000000, if not done by you. -BOI`;

function source(items) {
  const queue = [...items];
  return {
    async getCapturedNotifications() {
      return [...queue];
    },
    async removeCapturedNotifications(ids) {
      for (const id of ids) {
        queue.splice(
          queue.findIndex((item) => item.id === id),
          1,
        );
      }
    },
  };
}

const sms = (id, text, postedAt = posted) => ({
  id,
  packageName: 'com.google.android.apps.messaging',
  title: 'BOI',
  text,
  postedAt,
});

async function categoryIds(db) {
  const categories = await listCategories(db);
  const id = (name) => categories.find((category) => category.name === name).id;
  return { categories, travel: id('Travel'), loans: id('Loans') };
}

function expense(categoryId, fields = {}) {
  return {
    amountPaise: 100000,
    direction: 'debit',
    loanType: null,
    accountId: null,
    purpose: 'Train ticket',
    categoryId,
    occurredAt: posted,
    paymentMethod: 'UPI',
    merchant: 'IRCTC',
    reference: null,
    notes: null,
    ...fields,
  };
}

test('validateSplits: your share is the rest, names and amounts are checked', () => {
  const ok = validateSplits(100000, [{ merchant: ' Test  Friend ', amountText: '400' }]);
  assert.deepEqual(ok, { parts: [{ merchant: 'Test Friend', amountPaise: 40000 }], myPaise: 60000 });
  assert.match(validateSplits(100000, [{ merchant: '', amountText: '400' }]).error, /name/);
  assert.match(validateSplits(100000, [{ merchant: 'A', amountText: 'x' }]).error, /^A: /);
  assert.match(validateSplits(100000, [{ merchant: 'A', amountText: '1000' }]).error, /I gave/);
  assert.equal(previewMyShare('1000', [{ amountText: '250' }, { amountText: '' }]), 75000);
  assert.equal(previewMyShare('', []), null);
});

test('a split payment: your share is spending, the rest is money given, all in one group', async () => {
  const { db } = await createTestDatabase();
  const { travel, loans } = await categoryIds(db);
  const id = await createSplitPayment(
    db,
    expense(travel, { amountPaise: 60000 }),
    [{ merchant: 'Test Friend', amountPaise: 40000 }],
    loans,
  );
  const rows = await listTransactions(db);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.splitGroup === id));
  const given = rows.find((row) => row.loanType === 'lent');
  assert.equal(given.merchant, 'Test Friend');
  assert.equal(given.categoryId, loans);
  assert.equal(given.purpose, 'Train ticket');
  assert.equal((await getSpendingTotals(db, 0, Date.now())).totalPaise, 60000);
  const balances = await getLoanBalances(db);
  assert.equal(balances.owedToYouPaise, 40000);
});

test('a detected payment split from Review details is undone as a whole', async () => {
  const { db } = await createTestDatabase();
  const { categories, travel, loans } = await categoryIds(db);
  await syncCapturedNotifications(db, source([sms('s1', DEBIT('600000000101'))]));
  const [item] = await listPendingDetected(db, categories);
  await addDetectedAsTransaction(db, item.id, detectedToTransaction(item, travel), {
    parts: [{ merchant: 'Test Friend', amountPaise: 30000 }],
    loansCategoryId: loans,
  });
  assert.equal((await listTransactions(db)).length, 2);
  await undoAddDetected(db, item.id);
  assert.equal((await listTransactions(db)).length, 0, 'both parts removed');
});

test('remembered names: the next payment comes in with your spelling, category and type', async () => {
  const { db } = await createTestDatabase();
  const { categories, travel } = await categoryIds(db);
  await syncCapturedNotifications(db, source([sms('m1', DEBIT('600000000201'))]));
  const [first] = await listPendingDetected(db, categories);
  assert.equal(first.counterparty, 'TEST PERSON K');
  assert.equal(first.rememberedLoanType, null);
  // Saved from Review details as money given to "Test Person".
  await addDetectedAsTransaction(db, first.id, {
    ...detectedToTransaction(first, travel, 'lent'),
    merchant: 'Test Person',
  });

  await syncCapturedNotifications(db, source([sms('m2', DEBIT('600000000202'), posted + 86400000)]));
  const [second] = await listPendingDetected(db, categories);
  assert.equal(second.bankName, 'TEST PERSON K');
  assert.equal(second.counterparty, 'Test Person');
  assert.equal(second.rememberedLoanType, 'lent');

  // Saving it as an expense next time updates what is remembered.
  await addDetectedAsTransaction(db, second.id, detectedToTransaction(second, travel));
  await syncCapturedNotifications(db, source([sms('m3', DEBIT('600000000203'), posted + 2 * 86400000)]));
  const [third] = await listPendingDetected(db, categories);
  assert.equal(third.rememberedLoanType, null);
  assert.equal(third.suggestedCategoryId, travel);
  assert.equal(third.counterparty, 'Test Person');
});

test('return by: saved for money given only, never before the entry, shown as due or overdue', async () => {
  const base = {
    amountText: '500',
    categoryId: 1,
    paymentMethod: 'Cash',
    direction: 'debit',
    loanType: 'lent',
    merchant: 'Test Friend',
    occurredAt: posted,
  };
  const later = posted + 5 * 86400000;
  assert.equal(validateTransactionForm({ ...base, dueAt: later }, later).values.dueAt, later);
  assert.equal(validateTransactionForm({ ...base, loanType: null, dueAt: later }, later).values.dueAt, null);
  assert.ok(validateTransactionForm({ ...base, dueAt: posted - 2 * 86400000 }, later).errors.dueAt);

  const { db } = await createTestDatabase();
  const { loans } = await categoryIds(db);
  await createTransaction(db, expense(loans, { loanType: 'lent', merchant: 'Test Friend', dueAt: later }));
  const [person] = (await getLoanBalances(db)).people;
  assert.equal(person.dueAt, later);
  assert.deepEqual(dueText(person, later - 1000), { overdue: false, text: 'Return by 9 Nov' });
  assert.deepEqual(dueText(person, later + 3 * 86400000), { overdue: true, text: 'Overdue by 3 days' });
  assert.equal(dueText({ ...person, status: 'settled' }, later + 86400000), null);
});

test('backup and restore bring everything back, and bad files are refused', async () => {
  const { db } = await createTestDatabase();
  const { travel, loans } = await categoryIds(db);
  await db.runAsync("INSERT INTO categories (name, created_at) VALUES ('Test Custom', 0)");
  await createSplitPayment(db, expense(travel, { amountPaise: 60000 }), [{ merchant: 'A', amountPaise: 40000 }], loans);
  const backup = JSON.parse(JSON.stringify(await buildBackup(db)));
  assert.equal(checkBackup(backup).summary.entries, 2);

  const { db: fresh } = await createTestDatabase();
  await createTransaction(fresh, expense(travel, { merchant: 'Will be replaced' }));
  await restoreBackup(fresh, backup);
  const rows = await listTransactions(fresh);
  assert.deepEqual(rows.map((row) => row.merchant).sort(), ['A', 'IRCTC']);
  assert.ok((await listCategories(fresh)).some((category) => category.name === 'Test Custom'));

  assert.match(checkBackup({ app: 'other' }).error, /not a backup/);
  assert.match(checkBackup({ ...backup, schemaVersion: 999 }).error, /newer version/);
  await assert.rejects(() => restoreBackup(fresh, { ...backup, tables: { transactions: 'x' } }), /damaged/);
  assert.equal((await listTransactions(fresh)).length, 2, 'a refused file changes nothing');
});

test('return by: a date from an earlier, settled round does not make new money overdue', async () => {
  const { db } = await createTestDatabase();
  const { loans } = await categoryIds(db);
  const day = 86400000;
  const gave = (fields) =>
    createTransaction(db, expense(loans, { loanType: 'lent', merchant: 'Test Friend', ...fields }));
  await gave({ amountPaise: 50000, occurredAt: posted, dueAt: posted + 2 * day });
  await createTransaction(
    db,
    expense(loans, {
      loanType: 'lent_repaid',
      direction: 'credit',
      merchant: 'Test Friend',
      amountPaise: 50000,
      occurredAt: posted + day,
    }),
  );
  await gave({ amountPaise: 20000, occurredAt: posted + 10 * day });
  const [person] = (await getLoanBalances(db)).people;
  assert.equal(person.dueAt, null, 'the old date belonged to the settled round');
  assert.equal(dueText(person, posted + 11 * day), null);
});

test('remembered names follow a rename and a later edit of the saved entry', async () => {
  const { db } = await createTestDatabase();
  const { categories, travel, loans } = await categoryIds(db);
  await syncCapturedNotifications(db, source([sms('r1', DEBIT('600000000301'))]));
  const [first] = await listPendingDetected(db, categories);
  const id = await addDetectedAsTransaction(db, first.id, {
    ...detectedToTransaction(first, loans, 'lent'),
    merchant: 'Test P',
  });
  await renamePerson(db, 'Test P', 'Test Person');
  await syncCapturedNotifications(db, source([sms('r2', DEBIT('600000000302'), posted + 86400000)]));
  let [next] = await listPendingDetected(db, categories);
  assert.equal(next.counterparty, 'Test Person', 'rename is remembered');

  // Editing the first entry into an expense is remembered too.
  const saved = (await listTransactions(db)).find((row) => row.id === id);
  const edited = { ...saved, loanType: null, categoryId: travel, merchant: 'Test Shop' };
  await updateTransaction(db, id, edited);
  await rememberEditedName(db, id, edited);
  [next] = await listPendingDetected(db, categories);
  assert.equal(next.counterparty, 'Test Shop');
  assert.equal(next.rememberedLoanType, null);
  assert.equal(next.suggestedCategoryId, travel);
});
