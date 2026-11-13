// Second round of fixes (2026-11-11): shop accounts that cannot go below zero
// and can be edited, Undo that keeps an edit, split parts that stay together,
// old names with double spaces. Made-up names and messages, not real data.

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { listCategories } from '../src/db/categories.js';
import { addDetectedAsTransaction, listPendingDetected, undoAddDetected } from '../src/db/detected.js';
import { MIGRATIONS, migrateDbIfNeeded } from '../src/db/migrations.js';

import {
  addShopPayment,
  addShopPurchase,
  checkShopChange,
  createShopAccount,
  deleteShopAccount,
  getShopAccount,
  listShopEntries,
  updateShopAccount,
} from '../src/db/shopAccounts.js';
import { createTransaction, getTransaction, listTransactions, updateTransaction } from '../src/db/transactions.js';
import { createTestDatabase, wrapDatabase } from './helpers/testDatabase.js';
import { createSplitPayment, updateSplitShared } from '../src/db/splitPayments.js';
import { getPeopleBalances } from '../src/db/people.js';
import { getLastDetectedAt, syncCapturedNotifications } from '../src/db/detectedCapture.js';
import { detectedToTransaction } from '../src/domain/reviewChoices.js';

const posted = new Date(2026, 10, 4, 10, 0).getTime();
const NOW = new Date(2026, 10, 15, 12);

async function ids(db) {
  const categories = await listCategories(db);
  const id = (name) => categories.find((category) => category.name === name).id;
  return { categories, food: id('Food & Dining'), travel: id('Travel'), loans: id('Loans') };
}

const payment = (fields) => ({
  amountPaise: 8000,
  accountId: null,
  purpose: null,
  occurredAt: posted + 3600000,
  paymentMethod: 'Cash',
  reference: null,
  notes: null,
  ...fields,
});

test('a shop account cannot end up with more paid than taken', async () => {
  const { db } = await createTestDatabase();
  const { food } = await ids(db);
  const id = await createShopAccount(db, { name: 'XYZ Tea', categoryId: food });
  const teaA = await addShopPurchase(db, id, 4000, posted);
  await addShopPurchase(db, id, 4000, posted + 60000);
  const account = await getShopAccount(db, id, NOW);
  await addShopPayment(db, account, payment({ amountPaise: 8000 }));

  // Everything is paid: a tea cannot be deleted or lowered now.
  assert.match(await checkShopChange(db, { removeIds: [teaA] }), /more paid than taken/);
  assert.match(await checkShopChange(db, { edit: { id: teaA, values: { amountPaise: 1000 } } }), /more paid/);
  // Raising it is fine, and so is an entry that is not a shop entry.
  assert.equal(await checkShopChange(db, { edit: { id: teaA, values: { amountPaise: 9000 } } }), null);
  const other = await createTransaction(db, {
    ...payment({ amountPaise: 500 }),
    direction: 'debit',
    categoryId: food,
    merchant: 'Test Shop',
  });
  assert.equal(await checkShopChange(db, { removeIds: [other] }), null);
});

test('a shop account can be renamed and corrected, and removed only when empty', async () => {
  const { db } = await createTestDatabase();
  const { food } = await ids(db);
  const id = await createShopAccount(db, { name: 'XYZ Tea', categoryId: food, openingDuePaise: 100000 });
  await createShopAccount(db, { name: 'Other Shop', categoryId: food });
  const account = await getShopAccount(db, id, NOW);
  await addShopPayment(db, account, payment({ amountPaise: 60000 }));

  await assert.rejects(() => updateShopAccount(db, id, { name: 'other shop', openingDuePaise: 100000 }), /already has/);
  // ₹600 is already paid, so "already due" cannot drop below that.
  await assert.rejects(() => updateShopAccount(db, id, { name: 'XYZ Tea', openingDuePaise: 50000 }), /already paid/);

  await updateShopAccount(db, id, { name: ' ABC  Tea ', usualAmountPaise: 5000, openingDuePaise: 80000 });
  const updated = await getShopAccount(db, id, NOW);
  assert.equal(updated.name, 'ABC Tea');
  assert.equal(updated.usualAmountPaise, 5000);
  assert.equal(updated.duePaise, 20000);
  assert.equal((await listShopEntries(db, id))[0].merchant, 'ABC Tea', 'entries carry the new name');

  await assert.rejects(() => deleteShopAccount(db, id), /has entries/);
  const emptyId = await createShopAccount(db, { name: 'Empty Shop', categoryId: food });
  await deleteShopAccount(db, emptyId);
  assert.equal(await getShopAccount(db, emptyId, NOW), null);
});

test('Undo keeps an entry you changed after adding it', async () => {
  const { db } = await createTestDatabase();
  const { categories, travel } = await ids(db);
  assert.equal(await getLastDetectedAt(db), null);
  await syncCapturedNotifications(db, {
    async getCapturedNotifications() {
      return [
        {
          id: 'u1',
          packageName: 'com.google.android.apps.messaging',
          title: 'BOI',
          text: 'Rs.250.00 debited A/cXX2222 and credited to TEST SHOP via UPI Ref No 600000001101 on 04Nov26. Call 18000000000, if not done by you. -BOI',
          postedAt: posted,
        },
      ];
    },
    async removeCapturedNotifications() {},
  });
  assert.equal(await getLastDetectedAt(db), posted);

  const [item] = await listPendingDetected(db, categories);
  const transactionId = await addDetectedAsTransaction(db, item.id, detectedToTransaction(item, travel));
  const saved = await getTransaction(db, transactionId);
  // Make sure the edit has a later time stamp than the add.
  await new Promise((resolve) => setTimeout(resolve, 5));
  await updateTransaction(db, transactionId, { ...saved, purpose: 'Groceries' });

  await assert.rejects(() => undoAddDetected(db, item.id), /changed this entry/);
  assert.equal((await getTransaction(db, transactionId)).purpose, 'Groceries');
});

test('the parts of a split keep the same date and payment details', async () => {
  const { db } = await createTestDatabase();
  const { travel, loans } = await ids(db);
  const shareId = await createSplitPayment(
    db,
    {
      ...payment({ amountPaise: 60000, occurredAt: posted, paymentMethod: 'UPI' }),
      direction: 'debit',
      loanType: null,
      categoryId: travel,
      merchant: 'Test Cafe',
    },
    [{ merchant: 'Test Friend', amountPaise: 40000 }],
    loans,
  );
  const earlier = posted - 86400000;
  await updateSplitShared(db, shareId, shareId, {
    occurredAt: earlier,
    paymentMethod: 'Cash',
    accountId: null,
    reference: 'REF1',
  });
  const other = (await listTransactions(db)).find((row) => row.id !== shareId);
  assert.equal(other.occurredAt, earlier);
  assert.equal(other.paymentMethod, 'Cash');
  assert.equal(other.reference, 'REF1');
  assert.equal(other.amountPaise, 40000, "amounts stay each part's own");
  assert.equal(other.merchant, 'Test Friend');
});

test('upgrading to version 7 joins names that differed only by extra spaces', async () => {
  const raw = new DatabaseSync(':memory:');
  const db = wrapDatabase(raw);
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const migrate of MIGRATIONS.slice(0, 6)) {
      await migrate(txn);
    }
    await txn.execAsync('PRAGMA user_version = 6');
  });
  const loans = (await db.getFirstAsync("SELECT id FROM categories WHERE name = 'Loans'")).id;
  const give = (merchant, amountPaise) =>
    db.runAsync(
      `INSERT INTO transactions (amount_paise, direction, category_id, occurred_at, payment_method, merchant,
         loan_type, created_at, updated_at)
       VALUES (?, 'debit', ?, ?, 'Cash', ?, 'lent', 0, 0)`,
      [amountPaise, loans, posted, merchant],
    );
  await give('Rahul Kumar', 100000);
  await give('Rahul   Kumar', 20000);

  await migrateDbIfNeeded(db);
  const { people } = await getPeopleBalances(db);
  assert.equal(people.length, 1);
  assert.equal(people[0].person, 'Rahul Kumar');
  assert.equal(people[0].amountPaise, 120000);
});
