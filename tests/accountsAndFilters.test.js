import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAccount, findOrCreateAccount, listAccounts } from '../src/db/accounts.js';
import { listCategories } from '../src/db/categories.js';
import { createTransaction, listTransactions } from '../src/db/transactions.js';
import { createTestDatabase } from './helpers/testDatabase.js';

test('accounts can be added by hand: a name only, no duplicates, no empty names', async () => {
  const { db } = await createTestDatabase();

  const salary = await createAccount(db, '  SBI Salary  ');
  assert.equal(salary.nickname, 'SBI Salary', 'spaces at the ends are removed');
  assert.equal(salary.bankName, null);
  assert.equal(salary.last4, null, 'no account digits are stored');

  await assert.rejects(() => createAccount(db, 'sbi salary'), /already have an account with this name/);
  await assert.rejects(() => createAccount(db, '   '), /Enter a name/);

  // A detected account still works next to hand-added ones, and two hand-added ones can coexist.
  const detectedId = await findOrCreateAccount(db, { bankName: 'Bank of India', bankShort: 'BOI', last4: '1111' });
  await createAccount(db, 'Wallet');
  const names = (await listAccounts(db)).map((account) => account.nickname);
  assert.deepEqual(names, ['BOI ••1111', 'SBI Salary', 'Wallet']);
  assert.ok(detectedId);

  const long = await createAccount(db, 'x'.repeat(60));
  assert.equal(long.nickname.length, 40, 'names are kept to 40 characters');
});

test('history filters combine: category, payment method and bank account', async () => {
  const { db } = await createTestDatabase();
  const categories = await listCategories(db);
  const id = (name) => categories.find((c) => c.name === name).id;
  const boi = await findOrCreateAccount(db, { bankName: 'Bank of India', bankShort: 'BOI', last4: '1111' });
  const wallet = (await createAccount(db, 'Wallet')).id;
  const add = (amountPaise, category, paymentMethod, accountId) =>
    createTransaction(db, {
      amountPaise,
      direction: 'debit',
      categoryId: id(category),
      occurredAt: Date.now(),
      paymentMethod,
      accountId,
      purpose: null,
      merchant: null,
      reference: null,
      notes: null,
    });
  await add(100, 'Groceries', 'UPI', boi);
  await add(200, 'Groceries', 'Cash', wallet);
  await add(300, 'Food & Dining', 'UPI', boi);
  await add(400, 'Food & Dining', 'Card', null);

  const amounts = async (filters) =>
    (await listTransactions(db, { kind: 'regular', ...filters })).map((t) => t.amountPaise).sort((a, b) => a - b);
  assert.deepEqual(await amounts({ paymentMethod: 'UPI' }), [100, 300]);
  assert.deepEqual(await amounts({ paymentMethod: 'Cash' }), [200]);
  assert.deepEqual(await amounts({ categoryId: id('Groceries') }), [100, 200]);
  assert.deepEqual(await amounts({ accountId: boi }), [100, 300]);
  assert.deepEqual(await amounts({ categoryId: id('Food & Dining'), paymentMethod: 'UPI', accountId: boi }), [300]);
  assert.deepEqual(await amounts({ paymentMethod: 'Other' }), []);
  assert.deepEqual(await amounts({ categoryId: null, paymentMethod: null, accountId: null }), [100, 200, 300, 400]);
});
