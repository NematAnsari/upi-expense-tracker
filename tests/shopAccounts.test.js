// Shop accounts: tea taken now, paid later. Made-up shop and messages, not real data.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildBackup, restoreBackup } from '../src/db/backup.js';
import { listCategories } from '../src/db/categories.js';
import {
  addDetectedAsTransaction,
  detectedToTransaction,
  listPendingDetected,
  syncCapturedNotifications,
} from '../src/db/detected.js';
import { getDashboardData, getMonthlyReport } from '../src/db/reports.js';
import {
  addShopPayment,
  addShopPurchase,
  checkShopPayment,
  createShopAccount,
  getShopAccount,
  listShopAccounts,
  shopPaymentValues,
} from '../src/db/shopAccounts.js';
import { listTransactions } from '../src/db/transactions.js';
import { groupRepeats } from '../src/domain/repeats.js';
import { paymentText, shopStatement } from '../src/domain/shopAccount.js';
import { createTestDatabase } from './helpers/testDatabase.js';

const at = (month, day, hour = 9) => new Date(2026, month - 1, day, hour).getTime();
const NOV_15 = new Date(2026, 10, 15, 12);

test('the diary rule: what is left at the end of a month carries over', () => {
  const entries = [
    { shopEntry: 'purchase', amountPaise: 300000, occurredAt: at(10, 5) },
    { shopEntry: 'payment', amountPaise: 200000, occurredAt: at(10, 31) },
    { shopEntry: 'purchase', amountPaise: 100000, occurredAt: at(11, 2) },
    { shopEntry: 'purchase', amountPaise: 50000, occurredAt: at(11, 3) },
  ];
  const { duePaise, months } = shopStatement({ openingDuePaise: 0, createdAt: at(10, 1) }, entries, NOV_15);
  assert.equal(duePaise, 250000);
  assert.deepEqual(
    months.map((month) => [
      month.monthKey,
      month.carriedInPaise,
      month.purchasesPaise,
      month.paidPaise,
      month.duePaise,
    ]),
    [
      ['2026-10', 0, 300000, 200000, 100000],
      ['2026-11', 100000, 150000, 0, 250000],
    ],
  );
  assert.equal(months[1].count, 2);

  // An amount already due from the diary is carried into the first month; empty months still carry it.
  const opened = shopStatement({ openingDuePaise: 40000, createdAt: at(9, 20) }, [], NOV_15);
  assert.deepEqual(
    opened.months.map((month) => month.duePaise),
    [40000, 40000, 40000],
  );
});

test('teas are spending on their day; paying the shop is not counted again', async () => {
  const { db } = await createTestDatabase();
  const categories = await listCategories(db);
  const food = categories.find((category) => category.name === 'Food & Dining').id;
  const id = await createShopAccount(db, { name: ' XYZ  Tea ', categoryId: food, openingDuePaise: 100000 });
  await assert.rejects(() => createShopAccount(db, { name: 'xyz tea', categoryId: food }), /already has/);

  await addShopPurchase(db, id, 4000, at(11, 4, 9));
  await addShopPurchase(db, id, 4000, at(11, 4, 16));
  const account = await getShopAccount(db, id, NOV_15);
  assert.equal(account.name, 'XYZ Tea');
  assert.equal(account.duePaise, 108000);
  assert.equal(account.usualAmountPaise, 4000, 'the last amount is filled in next time');

  assert.match(await checkShopPayment(db, id, 200000, null, NOV_15), /Enter ₹1,080.00 or less/);
  assert.equal(await checkShopPayment(db, id, 50000, null, NOV_15), null);
  await addShopPayment(db, account, {
    amountPaise: 50000,
    accountId: null,
    purpose: null,
    occurredAt: at(11, 10),
    paymentMethod: 'Cash',
    reference: null,
    notes: null,
  });
  const [summary] = await listShopAccounts(db, NOV_15);
  assert.equal(summary.duePaise, 58000);
  assert.equal(summary.month.carriedInPaise, 100000);
  assert.equal(summary.month.paidPaise, 50000);

  // Spending: only the two teas. The payment and the opening amount are not spending.
  const report = await getMonthlyReport(db, '2026-11');
  assert.equal(report.totalPaise, 8000);
  const dashboard = await getDashboardData(db, '2026-11', NOV_15);
  assert.equal(dashboard.monthTotals.count, 2);
  assert.equal(dashboard.missingPurposeCount, 0, 'teas on an account need no purpose');
  const regular = await listTransactions(db, { kind: 'regular' });
  assert.equal(regular.length, 2, 'the payment is not in the expenses list');
  assert.equal(paymentText(regular[0]), 'Pay later');
  assert.equal(groupRepeats(regular).length, 1, "one day's teas share a row");
});

test('a bank payment to the shop can be added as a shop payment, and is remembered', async () => {
  const { db } = await createTestDatabase();
  const categories = await listCategories(db);
  const food = categories.find((category) => category.name === 'Food & Dining').id;
  const id = await createShopAccount(db, { name: 'XYZ Tea', categoryId: food, openingDuePaise: 300000 });
  const sms = (captureId, ref, postedAt) => ({
    id: captureId,
    packageName: 'com.google.android.apps.messaging',
    title: 'BOI',
    text: `Rs.1000.00 debited A/cXX2222 and credited to TEST TEA STALL via UPI Ref No ${ref} on 10Nov26. Call 18000000000, if not done by you. -BOI`,
    postedAt,
  });
  const queue = (items) => ({
    async getCapturedNotifications() {
      return items;
    },
    async removeCapturedNotifications() {},
  });

  await syncCapturedNotifications(db, queue([sms('t1', '600000000401', at(11, 10))]));
  const [first] = await listPendingDetected(db, categories);
  const [account] = await listShopAccounts(db, NOV_15);
  await addDetectedAsTransaction(db, first.id, shopPaymentValues(account, detectedToTransaction(first, food, null)));
  assert.equal((await getShopAccount(db, id, NOV_15)).duePaise, 200000);

  await syncCapturedNotifications(db, queue([sms('t2', '600000000402', at(11, 12))]));
  const [second] = await listPendingDetected(db, categories);
  assert.equal(second.rememberedShopAccountId, id);
  assert.equal(second.counterparty, 'XYZ Tea');
});

test('backup keeps shop accounts and their entries', async () => {
  const { db } = await createTestDatabase();
  const food = (await listCategories(db)).find((category) => category.name === 'Food & Dining').id;
  const id = await createShopAccount(db, { name: 'XYZ Tea', categoryId: food, openingDuePaise: 100000 });
  await addShopPurchase(db, id, 4000, at(11, 4));
  const backup = JSON.parse(JSON.stringify(await buildBackup(db)));

  const { db: fresh } = await createTestDatabase();
  await restoreBackup(fresh, backup);
  assert.equal((await getShopAccount(fresh, id, NOV_15)).duePaise, 104000);
});
