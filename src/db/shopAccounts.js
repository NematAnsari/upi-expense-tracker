// Shop accounts: take now, pay later (see domain/shopAccount.js).
// A tea is saved as an expense with shop_entry 'purchase' (spending on its
// day); paying the shop is saved with shop_entry 'payment' (not spending).

import { shopStatement } from '../domain/shopAccount.js';
import { formatINR } from '../utils/money.js';
import { createTransaction, SELECT_TRANSACTION } from './transactions.js';

const SELECT_ACCOUNT = `
  SELECT s.id, s.name, s.category_id AS categoryId, c.name AS categoryName,
         s.usual_amount_paise AS usualAmountPaise, s.opening_due_paise AS openingDuePaise,
         s.created_at AS createdAt
  FROM shop_accounts s
  JOIN categories c ON c.id = s.category_id
`;

async function entriesFor(db, accountId) {
  return db.getAllAsync(
    `SELECT shop_entry AS shopEntry, amount_paise AS amountPaise, occurred_at AS occurredAt
     FROM transactions WHERE shop_account_id = ?`,
    [accountId],
  );
}

/**
 * Every shop account with what is due now and this month's numbers:
 * [{ id, name, categoryId, categoryName, usualAmountPaise, duePaise,
 *    month: { carriedInPaise, purchasesPaise, count, paidPaise, duePaise } }].
 */
export async function listShopAccounts(db, now = new Date()) {
  const accounts = await db.getAllAsync(`${SELECT_ACCOUNT} ORDER BY s.name`);
  const result = [];
  for (const account of accounts) {
    const statement = shopStatement(account, await entriesFor(db, account.id), now);
    result.push({ ...account, duePaise: statement.duePaise, month: statement.months.at(-1) });
  }
  return result;
}

/** One account with its month-by-month statement (oldest first), or null. */
export async function getShopAccount(db, id, now = new Date()) {
  const account = await db.getFirstAsync(`${SELECT_ACCOUNT} WHERE s.id = ?`, [id]);
  if (!account) {
    return null;
  }
  const statement = shopStatement(account, await entriesFor(db, id), now);
  return { ...account, ...statement };
}

/** Every tea and payment on an account, newest first (rows like listTransactions). */
export async function listShopEntries(db, accountId) {
  return db.getAllAsync(`${SELECT_TRANSACTION} WHERE t.shop_account_id = ? ORDER BY t.occurred_at DESC, t.id DESC`, [
    accountId,
  ]);
}

/**
 * Starts an account. name: the shop ("XYZ Tea"). openingDuePaise: what you
 * already owe from your diary (0 when starting fresh). Returns the new id.
 */
export async function createShopAccount(db, { name, categoryId, usualAmountPaise = null, openingDuePaise = 0 }) {
  const clean = String(name ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!clean) {
    throw new Error('Enter the shop name.');
  }
  if (!Number.isInteger(categoryId)) {
    throw new Error('Choose a category.');
  }
  const existing = await db.getFirstAsync('SELECT id FROM shop_accounts WHERE name = ?', [clean]);
  if (existing) {
    throw new Error(`${clean} already has an account.`);
  }
  const result = await db.runAsync(
    `INSERT INTO shop_accounts (name, category_id, usual_amount_paise, opening_due_paise, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [clean, categoryId, usualAmountPaise, openingDuePaise, Date.now()],
  );
  return result.lastInsertRowId;
}

/**
 * One tea (or anything taken) on the account: spending today, not paid yet.
 * The amount becomes the one filled in next time.
 */
export async function addShopPurchase(db, accountId, amountPaise, occurredAt = Date.now()) {
  const account = await db.getFirstAsync(`${SELECT_ACCOUNT} WHERE s.id = ?`, [accountId]);
  if (!account) {
    throw new Error('This shop account no longer exists.');
  }
  let id = null;
  await db.withExclusiveTransactionAsync(async (txn) => {
    id = await createTransaction(txn, {
      amountPaise,
      direction: 'debit',
      loanType: null,
      accountId: null,
      purpose: null,
      categoryId: account.categoryId,
      occurredAt,
      // Not paid yet: "Other" keeps it out of UPI, cash and card filters.
      paymentMethod: 'Other',
      merchant: account.name,
      reference: null,
      notes: null,
      shopAccountId: accountId,
      shopEntry: 'purchase',
    });
    await txn.runAsync('UPDATE shop_accounts SET usual_amount_paise = ? WHERE id = ?', [amountPaise, accountId]);
  });
  return id;
}

/**
 * Paying the shop: lowers what is due. `values` is a transaction (amount,
 * method, bank account, date...); the shop fields are set here.
 */
export function shopPaymentValues(account, values) {
  return {
    ...values,
    direction: 'debit',
    loanType: null,
    categoryId: account.categoryId,
    merchant: account.name,
    shopAccountId: account.id,
    shopEntry: 'payment',
  };
}

export async function addShopPayment(db, account, values) {
  return createTransaction(db, shopPaymentValues(account, values));
}

/**
 * A payment cannot be more than what is due (you pay after taking, never in
 * advance). Returns an error message for the amount, or null when it is fine.
 * excludeId: a payment being edited, so its old amount is not counted.
 */
export async function checkShopPayment(db, accountId, amountPaise, excludeId = null, now = new Date()) {
  const account = await getShopAccount(db, accountId, now);
  if (!account) {
    return 'This shop account no longer exists.';
  }
  const old = excludeId
    ? await db.getFirstAsync(
        "SELECT amount_paise AS amountPaise FROM transactions WHERE id = ? AND shop_entry = 'payment'",
        [excludeId],
      )
    : null;
  const due = account.duePaise + (old?.amountPaise ?? 0);
  if (amountPaise <= due) {
    return null;
  }
  return due <= 0
    ? `Nothing is due at ${account.name}.`
    : `Due at ${account.name} is ${formatINR(due)}. Enter ${formatINR(due)} or less.`;
}
