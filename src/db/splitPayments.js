// Split payments: one payment where part was yours and part was for other
// people. Your share is saved as an expense, each other share as money given
// to that person. All parts share split_group (the id of your share).

import { createTransaction } from './transactions.js';

/**
 * Saves a split payment, all parts or none. values: your share (an expense).
 * parts: [{ merchant, amountPaise }] for the others; they copy the date,
 * method, account and reference from `values`. Returns your share's id.
 */
export async function createSplitPayment(db, values, parts, loansCategoryId) {
  let firstId = null;
  await db.withExclusiveTransactionAsync(async (txn) => {
    firstId = await insertSplitPayment(txn, values, parts, loansCategoryId);
  });
  return firstId;
}

/** createSplitPayment for a caller that is already inside a database transaction. */
export async function insertSplitPayment(txn, values, parts, loansCategoryId) {
  const firstId = await createTransaction(txn, values);
  await txn.runAsync('UPDATE transactions SET split_group = ? WHERE id = ?', [firstId, firstId]);
  for (const part of parts) {
    await createTransaction(txn, {
      ...values,
      amountPaise: part.amountPaise,
      direction: 'debit',
      loanType: 'lent',
      categoryId: loansCategoryId,
      merchant: part.merchant,
      dueAt: null,
      splitGroup: firstId,
    });
  }
  return firstId;
}

/** Every part of a split, your share first: [{ id, amountPaise, merchant, loanType }]. */
export async function listSplitParts(db, splitGroup) {
  return db.getAllAsync(
    `SELECT id, amount_paise AS amountPaise, merchant, loan_type AS loanType
     FROM transactions WHERE split_group = ? ORDER BY id`,
    [splitGroup],
  );
}

/**
 * After one part is edited, copies what all parts share to the others: date
 * and time, payment method, bank account, UPI reference and source. Amounts,
 * names and categories stay each part's own.
 */
export async function updateSplitShared(db, splitGroup, exceptId, values) {
  await db.runAsync(
    `UPDATE transactions SET occurred_at = ?, payment_method = ?, account_id = ?, reference = ?, source_text = ?,
       updated_at = ?
     WHERE split_group = ? AND id <> ?`,
    [
      values.occurredAt,
      values.paymentMethod,
      values.accountId ?? null,
      values.reference,
      values.sourceText ?? null,
      Date.now(),
      splitGroup,
      exceptId,
    ],
  );
}
