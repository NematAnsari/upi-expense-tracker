// Fixes for the nine gaps found in the code review of 2026-11-11.
// Made-up names and messages, not real data.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildBackup, checkBackup, restoreBackup } from '../src/db/backup.js';
import { listCategories } from '../src/db/categories.js';
import {
  addDetectedAsTransaction,
  addDetectedBatch,
  countPendingDetected,
  detectedToTransaction,
  listPendingDetected,
  listRecentDetected,
  syncCapturedNotifications,
  undoAddDetected,
} from '../src/db/detected.js';
import { checkLoanChange } from '../src/db/reports.js';
import {
  createSplitPayment,
  createTransaction,
  deleteTransactions,
  listSplitParts,
  listTransactions,
} from '../src/db/transactions.js';
import { pickableCategoryId } from '../src/domain/transactionForm.js';
import { validateTransactionForm } from '../src/domain/validation.js';
import { createTestDatabase } from './helpers/testDatabase.js';

const posted = new Date(2026, 10, 4, 10, 0).getTime();
const DAY = 86400000;

const sms = (id, rupees, name, ref, postedAt = posted) => ({
  id,
  packageName: 'com.google.android.apps.messaging',
  title: 'BOI',
  text: `Rs.${rupees}.00 debited A/cXX2222 and credited to ${name} via UPI Ref No ${ref} on 04Nov26. Call 18000000000, if not done by you. -BOI`,
  postedAt,
});

/** A stand-in for the native notification queue. */
const queue = (items) => ({
  async getCapturedNotifications() {
    return items;
  },
  async removeCapturedNotifications() {},
});

async function categoryIds(db) {
  const categories = await listCategories(db);
  const id = (name) => categories.find((category) => category.name === name).id;
  return { categories, travel: id('Travel'), loans: id('Loans') };
}

function entry(categoryId, fields = {}) {
  return {
    amountPaise: 100000,
    direction: 'debit',
    loanType: null,
    accountId: null,
    purpose: null,
    categoryId,
    occurredAt: posted,
    paymentMethod: 'Cash',
    merchant: null,
    reference: null,
    notes: null,
    ...fields,
  };
}

test('1. deleting a payment that came from a bank SMS puts it back for review', async () => {
  const { db } = await createTestDatabase();
  const { categories, travel } = await categoryIds(db);
  await syncCapturedNotifications(db, queue([sms('d1', 250, 'TEST SHOP', '600000000701')]));
  const [item] = await listPendingDetected(db, categories);
  const transactionId = await addDetectedAsTransaction(db, item.id, detectedToTransaction(item, travel));
  assert.equal(await countPendingDetected(db), 0);

  await deleteTransactions(db, [transactionId]);
  assert.equal((await listTransactions(db)).length, 0);
  assert.equal(await countPendingDetected(db), 1, 'back in the review list');

  // It can be reviewed and added again.
  const [again] = await listPendingDetected(db, categories);
  await addDetectedAsTransaction(db, again.id, detectedToTransaction(again, travel));
  assert.equal((await listTransactions(db)).length, 1);
});

test('2. money given cannot be lowered, deleted or turned around below what came back', async () => {
  const { db } = await createTestDatabase();
  const { travel, loans } = await categoryIds(db);
  const give = (fields) =>
    createTransaction(db, entry(loans, { loanType: 'lent', merchant: 'Test Friend', ...fields }));
  const back = (fields) =>
    createTransaction(
      db,
      entry(loans, { loanType: 'lent_repaid', direction: 'credit', merchant: 'Test Friend', ...fields }),
    );
  const gaveId = await give({ amountPaise: 100000, occurredAt: posted });
  const backId = await back({ amountPaise: 100000, occurredAt: posted + DAY });
  const edit = (id, values) => checkLoanChange(db, { edit: { id, values: { merchant: 'Test Friend', ...values } } });

  // The ₹1,000 given was all paid back, so it cannot drop to ₹500, be deleted, or become money taken.
  assert.match(
    await edit(gaveId, { loanType: 'lent', amountPaise: 50000, occurredAt: posted }),
    /Money received back from Test Friend/,
  );
  assert.match(await checkLoanChange(db, { removeIds: [gaveId] }), /received back/);
  assert.match(await edit(gaveId, { loanType: 'borrowed', amountPaise: 100000, occurredAt: posted }), /received back/);
  // Moving the money received back to before it was given is refused too.
  assert.match(
    await edit(backId, { loanType: 'lent_repaid', amountPaise: 100000, occurredAt: posted - DAY }),
    /received back/,
  );

  // These are fine: raising it, deleting the money received back, an unrelated expense.
  assert.equal(await edit(gaveId, { loanType: 'lent', amountPaise: 200000, occurredAt: posted }), null);
  assert.equal(await checkLoanChange(db, { removeIds: [backId] }), null);
  const expenseId = await createTransaction(db, entry(travel, { merchant: 'Test Shop' }));
  assert.equal(
    await checkLoanChange(db, {
      edit: { id: expenseId, values: { loanType: null, merchant: 'Test Shop', amountPaise: 100 } },
    }),
    null,
  );

  // A person who was already inconsistent (money back dated before the money given) can still be edited.
  const oldGave = await createTransaction(
    db,
    entry(loans, { loanType: 'lent', merchant: 'Old Friend', amountPaise: 100000, occurredAt: posted }),
  );
  await createTransaction(
    db,
    entry(loans, {
      loanType: 'lent_repaid',
      direction: 'credit',
      merchant: 'Old Friend',
      amountPaise: 100000,
      occurredAt: posted - DAY,
    }),
  );
  assert.equal(
    await checkLoanChange(db, {
      edit: {
        id: oldGave,
        values: { loanType: 'lent', merchant: 'Old Friend', amountPaise: 150000, occurredAt: posted },
      },
    }),
    null,
  );
});

test('3. the hidden Loans category is never suggested for an expense', async () => {
  const { db } = await createTestDatabase();
  const { categories, travel, loans } = await categoryIds(db);
  await syncCapturedNotifications(db, queue([sms('l1', 500, 'TEST PERSON K', '600000000801')]));
  const [first] = await listPendingDetected(db, categories);
  // Saved as money given, under the Loans category, with the bank's name as it is.
  await addDetectedAsTransaction(db, first.id, detectedToTransaction(first, loans, 'lent'));

  await syncCapturedNotifications(
    db,
    queue([
      sms('l1', 500, 'TEST PERSON K', '600000000801'),
      sms('l2', 300, 'TEST PERSON K', '600000000802', posted + DAY),
    ]),
  );
  const [next] = await listPendingDetected(db, categories);
  assert.notEqual(next.suggestedCategoryId, loans);

  // The form's suggestions use the same rule.
  assert.equal(pickableCategoryId(categories, loans), null);
  assert.equal(pickableCategoryId(categories, travel), travel);
});

test('4. a split entered by hand is recognised when its bank SMS arrives', async () => {
  const { db } = await createTestDatabase();
  const { categories, travel, loans } = await categoryIds(db);
  // ₹250 paid: ₹125 yours, ₹125 for a friend.
  await createSplitPayment(
    db,
    entry(travel, { amountPaise: 12500, merchant: 'Test Cafe', paymentMethod: 'UPI' }),
    [{ merchant: 'Test Friend', amountPaise: 12500 }],
    loans,
  );
  await syncCapturedNotifications(db, queue([sms('s1', 250, 'TEST CAFE', '600000000901', posted + 5 * 60000)]));
  const [item] = await listPendingDetected(db, categories);
  assert.equal(item.possibleDuplicate, 1);
  assert.equal(item.original.kind, 'saved');
  assert.equal(item.original.amountPaise, 25000);
});

test('4. a split with the same UPI reference is a duplicate of its bank SMS', async () => {
  const { db } = await createTestDatabase();
  const { travel, loans } = await categoryIds(db);
  await createSplitPayment(
    db,
    entry(travel, { amountPaise: 12500, merchant: 'Test Cafe', reference: '600000000902' }),
    [{ merchant: 'Test Friend', amountPaise: 12500 }],
    loans,
  );
  await syncCapturedNotifications(db, queue([sms('s2', 250, 'TEST CAFE', '600000000902')]));
  assert.equal((await listRecentDetected(db))[0].status, 'duplicate');
});

test('5. a split can be deleted as a whole, and the bank payment behind it goes back to review', async () => {
  const { db } = await createTestDatabase();
  const { categories, travel, loans } = await categoryIds(db);
  await syncCapturedNotifications(db, queue([sms('x1', 1000, 'TEST CAFE', '600000000903')]));
  const [item] = await listPendingDetected(db, categories);
  const shareId = await addDetectedAsTransaction(
    db,
    item.id,
    { ...detectedToTransaction(item, travel), amountPaise: 60000 },
    { parts: [{ merchant: 'Test Friend', amountPaise: 40000 }], loansCategoryId: loans },
  );

  const parts = await listSplitParts(db, shareId);
  assert.equal(parts.length, 2);
  assert.equal(parts[0].id, shareId, 'your share first');

  await deleteTransactions(
    db,
    parts.map((part) => part.id),
  );
  assert.equal((await listTransactions(db)).length, 0);
  assert.equal(await countPendingDetected(db), 1);
});

test('7. a name is saved with single spaces, so one person is not split in two', () => {
  const form = {
    amountText: '10',
    categoryId: 1,
    paymentMethod: 'Cash',
    direction: 'debit',
    loanType: 'lent',
    merchant: '  Rahul   Kumar ',
    occurredAt: posted,
  };
  assert.equal(validateTransactionForm(form, posted + 1000).values.merchant, 'Rahul Kumar');
});

test('8. restoring an old backup keeps the categories the app needs; a file with none is refused', async () => {
  const { db } = await createTestDatabase();
  const backup = JSON.parse(JSON.stringify(await buildBackup(db)));
  // As a backup from before version 4 would be: no Loans category.
  backup.schemaVersion = 3;
  backup.tables.categories = backup.tables.categories.filter((category) => category.name !== 'Loans');

  const { db: fresh } = await createTestDatabase();
  await restoreBackup(fresh, backup);
  const names = (await listCategories(fresh)).map((category) => category.name);
  assert.ok(names.includes('Loans'));
  assert.ok(names.includes('Income'));
  assert.ok(names.includes('Uncategorized'));

  assert.match(checkBackup({ ...backup, tables: { ...backup.tables, categories: [] } }).error, /damaged/);
});

test('9. Add all reports where it stopped, so what was added can still be undone', async () => {
  const { db } = await createTestDatabase();
  const { categories, travel } = await categoryIds(db);
  await syncCapturedNotifications(
    db,
    queue([sms('b1', 20, 'TEST A', '600000001001'), sms('b2', 30, 'TEST B', '600000001002')]),
  );
  const entries = (await listPendingDetected(db, categories)).map((item) => ({
    id: item.id,
    values: detectedToTransaction(item, travel),
  }));

  // The same payment twice: the second add fails because it was already handled.
  const stopped = await addDetectedBatch(db, [entries[0], entries[0], entries[1]]);
  assert.deepEqual(stopped.addedIds, [entries[0].id]);
  assert.ok(stopped.error);
  assert.equal((await listTransactions(db)).length, 1);

  await undoAddDetected(db, stopped.addedIds[0]);
  assert.equal((await listTransactions(db)).length, 0);
  assert.equal(await countPendingDetected(db), 2);

  const done = await addDetectedBatch(db, entries);
  assert.equal(done.error, null);
  assert.equal(done.addedIds.length, 2);
});
