import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { listAccounts, renameAccount } from '../src/db/accounts.js';
import { listCategories } from '../src/db/categories.js';
import {
  addDetectedAsTransaction,
  countPendingDetected,
  detectedToTransaction,
  ignoreDetected,
  listPendingDetected,
  listRecentDetected,
  restoreDetected,
  syncCapturedNotifications,
  undoAddDetected,
} from '../src/db/detected.js';
import { LATEST_VERSION, MIGRATIONS, migrateDbIfNeeded } from '../src/db/migrations.js';
import { getDashboardData, getMonthlyReport } from '../src/db/reports.js';
import { createTransaction, listTransactions } from '../src/db/transactions.js';
import { createTestDatabase, wrapDatabase } from './helpers/testDatabase.js';

// Made-up messages in the same format as real bank SMS. Not real data.
const KOTAK_CREDIT = 'Received Rs.500.00 in your kotak bank AC 1111 from TEST PERSON on 27-10-26. UPI Ref:600000000010';
const BOI_DEBIT =
  'Rs.250.00 debited A/cXX2222 and credited to DMART STORE via UPI Ref No 600000000011 on 27Oct26. Call 18000000000, if not done by you. -BOI';

const posted = new Date(2026, 9, 27, 16, 26).getTime();

/** A stand-in for the native notification queue. */
function fakeSource(items) {
  const queue = [...items];
  return {
    queue,
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

function captured(id, title, text, postedAt = posted) {
  return { id, packageName: 'com.google.android.apps.messaging', title, text, postedAt };
}

test('upgrading a version 2 database keeps expenses and adds Income/Uncategorized', async () => {
  const raw = new DatabaseSync(':memory:');
  const db = wrapDatabase(raw);
  await db.withExclusiveTransactionAsync(async (txn) => {
    await MIGRATIONS[0](txn);
    await MIGRATIONS[1](txn);
    await txn.execAsync('PRAGMA user_version = 2');
  });
  await db.runAsync("INSERT INTO categories (name, sort_order, created_at) VALUES ('income', 99, 0)"); // custom, lowercase
  const rent = (await db.getFirstAsync("SELECT id FROM categories WHERE name = 'Rent'")).id;
  // Plain SQL with only version 2 columns, exactly as the Phase 2 app saved it.
  await db.runAsync(
    `INSERT INTO transactions (amount_paise, purpose, category_id, occurred_at, payment_method, created_at, updated_at)
     VALUES (900000, 'Rent', ?, ?, 'UPI', 0, 0)`,
    [rent, posted],
  );

  await migrateDbIfNeeded(db);
  assert.equal(raw.prepare('PRAGMA user_version').get().user_version, LATEST_VERSION);
  const rows = await listTransactions(db);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amountPaise, 900000);
  assert.equal(rows[0].accountId, null);
  const names = (await listCategories(db)).map((c) => c.name.toLowerCase());
  assert.equal(names.filter((n) => n === 'income').length, 1, 'existing "income" category is not duplicated');
  assert.ok(names.includes('uncategorized'));
});

test('sync: parses, creates accounts, empties the native queue, and is safe to repeat', async () => {
  const { db } = await createTestDatabase();
  const source = fakeSource([
    captured('a', 'JD-KOTAKB-S', KOTAK_CREDIT),
    captured('b', 'JX-BOIIND-S', BOI_DEBIT),
    captured('c', 'Someone', 'Rs.100 cashback is waiting, claim now'),
  ]);

  assert.equal(await syncCapturedNotifications(db, source), 3);
  assert.equal(source.queue.length, 0);
  assert.equal(await countPendingDetected(db), 2);

  const recent = await listRecentDetected(db);
  assert.equal(recent.find((r) => r.title === 'Someone').status, 'unrecognized');

  const accounts = await listAccounts(db);
  assert.deepEqual(accounts.map((a) => a.nickname).sort(), ['BOI ••2222', 'Kotak ••1111']);

  // Same capture id again (e.g. app closed before the queue was cleared): no duplicate rows.
  await syncCapturedNotifications(db, fakeSource([captured('a', 'JD-KOTAKB-S', KOTAK_CREDIT)]));
  assert.equal((await listRecentDetected(db)).length, 3);
});

test('same UPI reference from two notifications is marked duplicate, not added twice', async () => {
  const { db } = await createTestDatabase();
  await syncCapturedNotifications(
    db,
    fakeSource([
      captured('a', 'JX-BOIIND-S', BOI_DEBIT),
      captured('b', 'JX-BOIIND-S', BOI_DEBIT), // re-posted later with a new capture id
    ]),
  );
  const statuses = (await listRecentDetected(db)).map((r) => r.status).sort();
  assert.deepEqual(statuses, ['duplicate', 'pending']);
});

test('reference already saved manually counts as duplicate', async () => {
  const { db } = await createTestDatabase();
  const other = (await listCategories(db)).find((c) => c.name === 'Other').id;
  await createTransaction(db, {
    amountPaise: 25000,
    purpose: 'Shopping',
    categoryId: other,
    occurredAt: posted,
    paymentMethod: 'UPI',
    merchant: null,
    reference: '600000000011',
    notes: null,
  });
  await syncCapturedNotifications(db, fakeSource([captured('a', 'JX-BOIIND-S', BOI_DEBIT)]));
  assert.equal((await listRecentDetected(db))[0].status, 'duplicate');
});

test('no reference: similar payment close in time is flagged, never merged', async () => {
  const { db } = await createTestDatabase();
  const text = 'Rs.80.00 debited from A/c XX5555 to TEA STALL';
  await syncCapturedNotifications(
    db,
    fakeSource([
      captured('a', 'AD-BOBTXN-S', text, posted),
      captured('b', 'AD-BOBTXN-S', text, posted + 5 * 60 * 1000), // 5 minutes later
      captured('c', 'AD-BOBTXN-S', text, posted + 60 * 60 * 1000), // an hour later: separate tea
    ]),
  );
  const rows = (await listRecentDetected(db)).sort((x, y) => x.postedAt - y.postedAt);
  assert.deepEqual(
    rows.map((r) => [r.status, r.possibleDuplicate]),
    [
      ['pending', 0],
      ['pending', 1],
      ['pending', 0],
    ],
  );
});

test('add: saves once with account and reference; second tap fails; credits are income', async () => {
  const { db } = await createTestDatabase();
  await syncCapturedNotifications(
    db,
    fakeSource([captured('a', 'JD-KOTAKB-S', KOTAK_CREDIT), captured('b', 'JX-BOIIND-S', BOI_DEBIT)]),
  );
  const categories = await listCategories(db);
  const pending = await listPendingDetected(db, categories);
  const credit = pending.find((p) => p.direction === 'credit');
  const debit = pending.find((p) => p.direction === 'debit');
  assert.equal(credit.suggestedCategoryName, 'Income');
  assert.equal(debit.suggestedCategoryName, 'Groceries'); // "DMART" keyword

  for (const item of [credit, debit]) {
    await addDetectedAsTransaction(db, item.id, detectedToTransaction(item, item.suggestedCategoryId));
  }
  await assert.rejects(
    addDetectedAsTransaction(db, debit.id, detectedToTransaction(debit, debit.suggestedCategoryId)),
    /already handled/,
  );
  assert.equal(await countPendingDetected(db), 0);

  const saved = await listTransactions(db);
  assert.equal(saved.length, 2);
  const savedDebit = saved.find((t) => t.direction === 'debit');
  assert.equal(savedDebit.accountName, 'BOI ••2222');
  assert.equal(savedDebit.reference, '600000000011');
  assert.equal(savedDebit.merchant, 'DMART STORE');

  // Spending counts only the debit; the credit shows as received.
  const report = await getMonthlyReport(db, '2026-10');
  assert.equal(report.totalPaise, 25000);
  assert.equal(report.count, 1);
  const dashboard = await getDashboardData(db, '2026-10', new Date(2026, 9, 27, 20));
  assert.equal(dashboard.monthTotals.totalPaise, 25000);
  assert.equal(dashboard.receivedTotals.totalPaise, 50000);
  assert.equal(dashboard.missingPurposeCount, 1, 'only the debit needs a purpose');

  // Filter history by account.
  assert.equal((await listTransactions(db, { accountId: savedDebit.accountId })).length, 1);
});

test('merchant memory beats keywords for suggestions', async () => {
  const { db } = await createTestDatabase();
  const categories = await listCategories(db);
  const shopping = categories.find((c) => c.name === 'Shopping').id;
  await createTransaction(db, {
    amountPaise: 1000,
    purpose: 'Gift',
    categoryId: shopping,
    occurredAt: posted - 86400000,
    paymentMethod: 'UPI',
    merchant: 'dmart store',
    reference: null,
    notes: null,
  });
  await syncCapturedNotifications(db, fakeSource([captured('b', 'JX-BOIIND-S', BOI_DEBIT)]));
  const [pending] = await listPendingDetected(db, categories);
  assert.equal(pending.suggestedCategoryName, 'Shopping');
});

test('ignore and rename account', async () => {
  const { db } = await createTestDatabase();
  await syncCapturedNotifications(db, fakeSource([captured('b', 'JX-BOIIND-S', BOI_DEBIT)]));
  const [item] = await listPendingDetected(db, await listCategories(db));
  await ignoreDetected(db, item.id);
  assert.equal(await countPendingDetected(db), 0);
  assert.equal((await listTransactions(db)).length, 0);

  const [account] = await listAccounts(db);
  await renameAccount(db, account.id, '  BOI Savings ');
  assert.equal((await listAccounts(db))[0].nickname, 'BOI Savings');
  await assert.rejects(renameAccount(db, account.id, '  '), /Enter a name/);
});

// Same ₹1 credit reported by three apps, as seen on a real phone (details replaced).
const BOI_CREDIT = 'BOI -  Rs.1.00 Credited to your Ac XX2222 on 27-10-26 by UPI ref No.600000000020.Avl Bal 12345.90';

test('Truecaller copies are ignored; Google Pay copy of a bank SMS is flagged', async () => {
  const { db } = await createTestDatabase();
  const minute = 60 * 1000;
  await syncCapturedNotifications(
    db,
    fakeSource([
      captured('sms', 'JM-BOIIND-S', BOI_CREDIT, posted),
      {
        id: 'tc',
        packageName: 'com.truecaller',
        title: '₹1',
        text: '•  Bank of India  •  Received via UPI',
        postedAt: posted,
      },
      {
        id: 'gpay',
        packageName: 'com.google.android.apps.nbu.paisa.user',
        title: 'TEST PERSON paid you ₹1.00',
        text: 'Payment from PhonePe',
        postedAt: posted + minute,
      },
    ]),
  );

  const rows = await listRecentDetected(db);
  const byPackage = (name) => rows.find((r) => r.sourcePackage === name);
  assert.equal(byPackage('com.truecaller').status, 'ignored');
  assert.equal(byPackage('com.google.android.apps.messaging').status, 'pending');
  assert.equal(byPackage('com.google.android.apps.messaging').possibleDuplicate, 0);
  const gpay = byPackage('com.google.android.apps.nbu.paisa.user');
  assert.equal(gpay.status, 'pending');
  assert.equal(gpay.direction, 'credit');
  assert.equal(gpay.possibleDuplicate, 1, 'flagged, not merged');
  assert.equal(await countPendingDetected(db), 2);
});

test('two ₹1 credits a minute apart with different references are both normal', async () => {
  const { db } = await createTestDatabase();
  const minute = 60 * 1000;
  const second = BOI_CREDIT.replace('600000000020', '600000000021');
  await syncCapturedNotifications(
    db,
    fakeSource([
      captured('sms1', 'JM-BOIIND-S', BOI_CREDIT, posted),
      captured('sms2', 'JM-BOIIND-S', second, posted + minute),
      {
        id: 'gpay',
        packageName: 'com.google.android.apps.nbu.paisa.user',
        title: 'TEST PERSON paid you ₹1.00',
        text: 'Tap to view.',
        postedAt: posted + minute,
      },
    ]),
  );
  const rows = await listRecentDetected(db);
  const sms = rows.filter((r) => r.sourcePackage === 'com.google.android.apps.messaging');
  assert.deepEqual(
    sms.map((r) => [r.status, r.possibleDuplicate]),
    [
      ['pending', 0],
      ['pending', 0],
    ],
  );
  // The Google Pay copy has no reference, so it is still flagged.
  assert.equal(rows.find((r) => r.sourcePackage === 'com.google.android.apps.nbu.paisa.user').possibleDuplicate, 1);
});

test('a possible duplicate says which payment it repeats', async () => {
  const { db } = await createTestDatabase();
  await syncCapturedNotifications(
    db,
    fakeSource([
      captured('sms', 'JM-BOIIND-S', BOI_CREDIT, posted),
      {
        id: 'gpay',
        packageName: 'com.google.android.apps.nbu.paisa.user',
        title: 'TEST PERSON paid you ₹1.00',
        text: 'Tap to view.',
        postedAt: posted + 60 * 1000,
      },
    ]),
  );
  const pending = await listPendingDetected(db, await listCategories(db));
  const flagged = pending.find((p) => p.possibleDuplicate);
  assert.equal(flagged.original.kind, 'detected');
  assert.equal(flagged.original.at, posted);
  assert.equal(flagged.original.accountName, 'BOI ••2222');
  assert.equal(flagged.original.sourcePackage, 'com.google.android.apps.messaging');
  assert.equal(pending.find((p) => !p.possibleDuplicate).original, null);
});

test('undo add removes the saved entry and puts the item back for review', async () => {
  const { db } = await createTestDatabase();
  await syncCapturedNotifications(db, fakeSource([captured('b', 'JX-BOIIND-S', BOI_DEBIT)]));
  const [item] = await listPendingDetected(db, await listCategories(db));
  await addDetectedAsTransaction(db, item.id, detectedToTransaction(item, item.suggestedCategoryId));
  assert.equal((await listTransactions(db)).length, 1);

  await undoAddDetected(db, item.id);
  assert.equal((await listTransactions(db)).length, 0);
  assert.equal(await countPendingDetected(db), 1);
  await assert.rejects(undoAddDetected(db, item.id), /can no longer be undone/);
});

test('an ignored item can be restored to the review list', async () => {
  const { db } = await createTestDatabase();
  await syncCapturedNotifications(db, fakeSource([captured('b', 'JX-BOIIND-S', BOI_DEBIT)]));
  const [item] = await listPendingDetected(db, await listCategories(db));
  await ignoreDetected(db, item.id);
  assert.equal(await countPendingDetected(db), 0);
  await restoreDetected(db, item.id);
  assert.equal(await countPendingDetected(db), 1);
});

test('waiting items are re-read with the current rules; handled ones are left alone', async () => {
  const { raw, db } = await createTestDatabase();
  // Simulate rows saved by an older, buggier reader.
  const insert = raw.prepare(`INSERT INTO detected_payments
    (capture_id, source_package, title, raw_text, posted_at, created_at, status, direction, amount_paise)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`);
  insert.run(
    'old-gpay',
    'com.google.android.apps.nbu.paisa.user',
    'TEST PERSON paid you ₹1.00',
    'Tap to view.',
    posted,
    'pending',
    'debit',
    100,
  );
  insert.run('old-tc', 'com.truecaller', '₹1', 'Received via UPI', posted, 'pending', 'credit', 100);
  insert.run(
    'old-added',
    'com.google.android.apps.nbu.paisa.user',
    'TEST PERSON paid you ₹5.00',
    'Tap to view.',
    posted,
    'added',
    'debit',
    500,
  );

  await syncCapturedNotifications(db, fakeSource([]));

  const rows = await listRecentDetected(db);
  const get = (title) => rows.find((r) => r.title === title);
  assert.equal(get('TEST PERSON paid you ₹1.00').direction, 'credit', 'fixed');
  assert.equal(get('TEST PERSON paid you ₹1.00').counterparty, 'TEST PERSON');
  assert.equal(get('₹1').status, 'ignored');
  assert.equal(get('TEST PERSON paid you ₹5.00').direction, 'debit', 'already added: not touched');
});

test('a failure on one item keeps it queued for retry', async () => {
  const { db } = await createTestDatabase();
  const source = fakeSource([captured('a', 'JX-BOIIND-S', BOI_DEBIT), { id: 'bad', title: 'x', text: 'Rs.5 paid' }]);
  // postedAt missing on "bad" violates NOT NULL, so that one fails.
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal(await syncCapturedNotifications(db, source), 1);
  } finally {
    console.error = originalError;
  }
  assert.deepEqual(
    source.queue.map((item) => item.id),
    ['bad'],
  );
});
