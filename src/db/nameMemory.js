// Remembered names: what you saved for a name as the bank writes it
// ("RAHUL KUMAR S"), so the next payment from that name comes in filled:
// your spelling ("Rahul"), the category, whether it was money given or taken,
// and the shop account if it was a shop payment.

import { isReturnType } from '../domain/entryTypes.js';

/** Bank name -> what was saved, for every remembered name. Keys are trimmed and lower case. */
export async function listRememberedNames(db) {
  const rows = await db.getAllAsync(
    `SELECT bank_name AS bankName, merchant, category_id AS categoryId, loan_type AS loanType,
            shop_account_id AS shopAccountId
     FROM name_memory`,
  );
  return new Map(rows.map((row) => [row.bankName.trim().toLowerCase(), row]));
}

async function getRememberedName(db, bankName) {
  return db.getFirstAsync(
    `SELECT merchant, category_id AS categoryId, loan_type AS loanType, shop_account_id AS shopAccountId
     FROM name_memory WHERE bank_name = ?`,
    [bankName],
  );
}

/**
 * Remembers what you saved for a bank's name. Money received back or returned
 * keeps the type remembered before, since those are suggested from what is
 * still open. Money given or taken keeps the category remembered before,
 * since it is saved under the hidden Loans category.
 */
export async function rememberName(db, bankName, values) {
  const key = bankName?.trim();
  if (!key) {
    return;
  }
  const before = await getRememberedName(db, key);
  const loanType = isReturnType(values.loanType) ? (before?.loanType ?? null) : (values.loanType ?? null);
  const categoryId = values.loanType ? (before?.categoryId ?? null) : values.categoryId;
  const shopAccountId = values.shopEntry === 'payment' ? values.shopAccountId : null;
  await db.runAsync(
    `INSERT INTO name_memory (bank_name, merchant, category_id, loan_type, shop_account_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (bank_name) DO UPDATE SET
       merchant = excluded.merchant, category_id = excluded.category_id, loan_type = excluded.loan_type,
       shop_account_id = excluded.shop_account_id, updated_at = excluded.updated_at`,
    [key, values.merchant ?? null, categoryId, loanType, shopAccountId, Date.now()],
  );
}

/** After you edit an entry that came from a bank SMS, remembers the fix too. Entries typed by hand are skipped. */
export async function rememberEditedName(db, transactionId, values) {
  const row = await db.getFirstAsync(
    "SELECT counterparty FROM detected_payments WHERE transaction_id = ? AND status = 'added'",
    [transactionId],
  );
  if (row?.counterparty) {
    await rememberName(db, row.counterparty, values);
  }
}
