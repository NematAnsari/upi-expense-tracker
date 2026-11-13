// Shop accounts: take now, pay later (see domain/shopAccounts.js).
// A tea is saved as an expense with shop_entry 'purchase' (spending on its
// day); paying the shop is saved with shop_entry 'payment' (not spending).

import { shopPaymentValues, shopStatement } from '../domain/shopAccounts.js';
import { formatINR } from '../utils/money.js';
import { cleanName } from '../utils/text.js';
import { createTransaction, SELECT_TRANSACTION } from './transactions.js';

const SELECT_SHOP = `
  SELECT s.id, s.name, s.category_id AS categoryId, c.name AS categoryName,
         s.usual_amount_paise AS usualAmountPaise, s.opening_due_paise AS openingDuePaise,
         s.created_at AS createdAt
  FROM shop_accounts s
  JOIN categories c ON c.id = s.category_id
`;

// What shopStatement needs from each tea and payment.
const SELECT_SHOP_AMOUNTS = `
  SELECT shop_account_id AS shopAccountId, shop_entry AS shopEntry, amount_paise AS amountPaise,
         occurred_at AS occurredAt
  FROM transactions
`;

async function listShopAmounts(db, accountId) {
  return db.getAllAsync(`${SELECT_SHOP_AMOUNTS} WHERE shop_account_id = ?`, [accountId]);
}

/** The cleaned shop name. Throws when it is empty or another account (not exceptId) has it. */
async function checkShopName(db, name, exceptId = null) {
  const shopName = cleanName(name);
  if (!shopName) {
    throw new Error('Enter the shop name.');
  }
  const taken = await db.getFirstAsync('SELECT id FROM shop_accounts WHERE name = ? AND id IS NOT ?', [
    shopName,
    exceptId,
  ]);
  if (taken) {
    throw new Error(`${shopName} already has an account.`);
  }
  return shopName;
}

/**
 * Every shop account with what is due now and this month's numbers:
 * [{ id, name, categoryId, categoryName, usualAmountPaise, duePaise,
 *    month: { carriedInPaise, purchasesPaise, count, paidPaise, duePaise } }].
 */
export async function listShopAccounts(db, now = new Date()) {
  // Two queries in all (not one per shop): the amounts are grouped here.
  const [accounts, amounts] = await Promise.all([
    db.getAllAsync(`${SELECT_SHOP} ORDER BY s.name`),
    db.getAllAsync(`${SELECT_SHOP_AMOUNTS} WHERE shop_account_id IS NOT NULL`),
  ]);
  const byAccount = new Map();
  for (const row of amounts) {
    if (!byAccount.has(row.shopAccountId)) {
      byAccount.set(row.shopAccountId, []);
    }
    byAccount.get(row.shopAccountId).push(row);
  }
  return accounts.map((account) => {
    const statement = shopStatement(account, byAccount.get(account.id) ?? [], now);
    return { ...account, duePaise: statement.duePaise, month: statement.months.at(-1) };
  });
}

/** One account with its month-by-month statement (oldest first), or null. */
export async function getShopAccount(db, id, now = new Date()) {
  const account = await db.getFirstAsync(`${SELECT_SHOP} WHERE s.id = ?`, [id]);
  if (!account) {
    return null;
  }
  const statement = shopStatement(account, await listShopAmounts(db, id), now);
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
  if (!cleanName(name)) {
    throw new Error('Enter the shop name.');
  }
  if (!Number.isInteger(categoryId)) {
    throw new Error('Choose a category.');
  }
  const shopName = await checkShopName(db, name);
  const result = await db.runAsync(
    `INSERT INTO shop_accounts (name, category_id, usual_amount_paise, opening_due_paise, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [shopName, categoryId, usualAmountPaise, openingDuePaise, Date.now()],
  );
  return result.lastInsertRowId;
}

/**
 * One tea (or anything taken) on the account: spending today, not paid yet.
 * The amount becomes the one filled in next time.
 */
export async function addShopPurchase(db, accountId, amountPaise, occurredAt = Date.now()) {
  const account = await db.getFirstAsync(`${SELECT_SHOP} WHERE s.id = ?`, [accountId]);
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

/**
 * Deleting or lowering something taken must not leave more paid than taken at
 * a shop (the amount due would go below zero). Example: ₹500 of tea, all
 * paid; one ₹40 tea cannot be deleted until the payment is changed.
 * removeIds: entries about to be deleted. edit: { id, values } for an entry
 * whose amount is about to change. Only a change that newly breaks the
 * account is refused. Returns an error message, or null when it is fine.
 */
export async function checkShopChange(db, { removeIds = [], edit = null }) {
  const ids = [...removeIds, ...(edit ? [edit.id] : [])];
  if (ids.length === 0) {
    return null;
  }
  const rows = await db.getAllAsync(
    `SELECT id, shop_account_id AS shopAccountId, shop_entry AS shopEntry, amount_paise AS amountPaise
     FROM transactions WHERE shop_account_id IS NOT NULL AND id IN (${ids.map(() => '?').join(', ')})`,
    ids,
  );
  // How much each account's due amount would move.
  const changes = {};
  for (const row of rows) {
    const sign = row.shopEntry === 'payment' ? -1 : 1;
    const newAmount = removeIds.includes(row.id) ? 0 : edit.values.amountPaise;
    changes[row.shopAccountId] = (changes[row.shopAccountId] ?? 0) + sign * (newAmount - row.amountPaise);
  }
  for (const [accountId, change] of Object.entries(changes)) {
    const account = await getShopAccount(db, Number(accountId));
    if (account && account.duePaise >= 0 && account.duePaise + change < 0) {
      return `${account.name} would have more paid than taken. Change or delete the payment first.`;
    }
  }
  return null;
}

/**
 * Changes an account's name, usual amount or the amount that was already due.
 * A new name is also written on its entries and on names remembered from
 * bank SMS, so lists and the next SMS show it. The already-due amount cannot
 * be lowered so far that more was paid than is due.
 */
export async function updateShopAccount(db, id, { name, usualAmountPaise = null, openingDuePaise = 0 }) {
  const account = await getShopAccount(db, id);
  if (!account) {
    throw new Error('This shop account no longer exists.');
  }
  const shopName = await checkShopName(db, name, id);
  const dueAfter = account.duePaise - account.openingDuePaise + openingDuePaise;
  if (dueAfter < 0) {
    throw new Error(
      `Already due cannot be less than ${formatINR(openingDuePaise - dueAfter)}: that much is already paid.`,
    );
  }
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      'UPDATE shop_accounts SET name = ?, usual_amount_paise = ?, opening_due_paise = ? WHERE id = ?',
      [shopName, usualAmountPaise, openingDuePaise, id],
    );
    await txn.runAsync('UPDATE transactions SET merchant = ?, updated_at = ? WHERE shop_account_id = ?', [
      shopName,
      Date.now(),
      id,
    ]);
    await txn.runAsync('UPDATE name_memory SET merchant = ? WHERE shop_account_id = ?', [shopName, id]);
  });
}

/** Removes an account that has no entries. One with entries is kept: delete those first. */
export async function deleteShopAccount(db, id) {
  const row = await db.getFirstAsync('SELECT COUNT(*) AS count FROM transactions WHERE shop_account_id = ?', [id]);
  if ((row?.count ?? 0) > 0) {
    throw new Error('This account has entries. Delete them from the statement first.');
  }
  await db.runAsync('DELETE FROM shop_accounts WHERE id = ?', [id]);
}
