// The Review screen's side of bank payments: listing what waits, adding,
// ignoring and undoing. Nothing is saved as an expense until you tap Add.
// How messages are read in is in detectedCapture.js.

import { INCOME, OTHER, UNCATEGORIZED } from '../constants/categories.js';
import { suggestCategoryName } from '../domain/categorize.js';
import { findCategory, pickableCategoryId } from '../domain/transactionForm.js';
import { findPossibleOriginal } from './detectedCapture.js';
import { listRememberedNames, rememberName } from './nameMemory.js';
import { insertSplitPayment } from './splitPayments.js';
import { createTransaction } from './transactions.js';

const SELECT_DETECTED = `
  SELECT
    d.id,
    d.title,
    d.raw_text AS rawText,
    d.source_package AS sourcePackage,
    d.posted_at AS postedAt,
    d.direction,
    d.amount_paise AS amountPaise,
    d.account_id AS accountId,
    a.nickname AS accountName,
    a.bank_name AS accountBank,
    d.counterparty,
    d.reference,
    d.status,
    d.possible_duplicate AS possibleDuplicate,
    d.transaction_id AS transactionId
  FROM detected_payments d
  LEFT JOIN accounts a ON a.id = d.account_id
`;

export async function countPendingDetected(db) {
  const row = await db.getFirstAsync("SELECT COUNT(*) AS count FROM detected_payments WHERE status = 'pending'");
  return row?.count ?? 0;
}

/**
 * The category to suggest: the one last used for this name, else a keyword
 * match. Money given or taken is skipped: its Loans category must never be
 * suggested for an expense.
 */
async function suggestCategoryId(db, detected, categories) {
  if (detected.direction === 'debit' && detected.counterparty) {
    const previous = await db.getFirstAsync(
      `SELECT category_id AS categoryId FROM transactions
       WHERE lower(merchant) = lower(?) AND direction = 'debit' AND loan_type IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [detected.counterparty],
    );
    if (previous) {
      return previous.categoryId;
    }
  }
  const name = suggestCategoryName(detected.counterparty, detected.direction);
  const fallback = detected.direction === 'credit' ? INCOME : UNCATEGORIZED;
  const category =
    findCategory(categories, name) ?? findCategory(categories, fallback) ?? findCategory(categories, OTHER);
  return category?.id ?? null;
}

/** A remembered type is used only when it fits: I gave is money out, I took is money in. */
function rememberedTypeFits(loanType, direction) {
  return (loanType === 'lent' && direction === 'debit') || (loanType === 'borrowed' && direction === 'credit');
}

/**
 * A waiting payment with what its Review card needs: the suggested category,
 * the remembered name and type, and for a possible duplicate the earlier
 * payment it looks like (`original`). `counterparty` is your spelling of the
 * name and `bankName` the bank's.
 */
async function withSuggestions(db, row, categories, remembered) {
  const memory = remembered.get(
    String(row.counterparty ?? '')
      .trim()
      .toLowerCase(),
  );
  // A remembered Loans category is not used: you cannot pick it for an expense.
  const suggestedCategoryId =
    pickableCategoryId(categories, memory?.categoryId) ?? (await suggestCategoryId(db, row, categories));
  const original = row.possibleDuplicate
    ? await findPossibleOriginal(db, row, row.accountId, row.postedAt, row.id)
    : null;
  return {
    ...row,
    bankName: row.counterparty,
    counterparty: memory?.merchant || row.counterparty,
    rememberedLoanType: rememberedTypeFits(memory?.loanType, row.direction) ? memory.loanType : null,
    rememberedShopAccountId: row.direction === 'debit' ? (memory?.shopAccountId ?? null) : null,
    suggestedCategoryId,
    suggestedCategoryName: categories.find((category) => category.id === suggestedCategoryId)?.name ?? null,
    original,
  };
}

/** Waiting payments, newest first, ready for the Review cards (see withSuggestions). */
export async function listPendingDetected(db, categories) {
  const [rows, remembered] = await Promise.all([
    db.getAllAsync(`${SELECT_DETECTED} WHERE d.status = 'pending' ORDER BY d.posted_at DESC`),
    listRememberedNames(db),
  ]);
  const items = [];
  for (const row of rows) {
    items.push(await withSuggestions(db, row, categories, remembered));
  }
  return items;
}

/** One waiting payment, ready for its card, or null when it was already added or ignored. */
export async function getPendingDetected(db, id, categories) {
  const row = await db.getFirstAsync(`${SELECT_DETECTED} WHERE d.status = 'pending' AND d.id = ?`, [id]);
  return row ? withSuggestions(db, row, categories, await listRememberedNames(db)) : null;
}

/** Recent captures of every status, for the Payment detection screen. */
export async function listRecentDetected(db, limit = 50) {
  return db.getAllAsync(`${SELECT_DETECTED} ORDER BY d.posted_at DESC LIMIT ?`, [limit]);
}

/**
 * Saves a bank payment as an entry and marks it added; what you chose is
 * remembered for the bank's name. Fails without saving if it was already
 * handled, so a double tap cannot add it twice.
 * split: { parts, loansCategoryId } to save it as a split payment.
 */
export async function addDetectedAsTransaction(db, detectedId, values, split = null) {
  let transactionId = null;
  await db.withExclusiveTransactionAsync(async (txn) => {
    const row = await txn.getFirstAsync('SELECT status, counterparty FROM detected_payments WHERE id = ?', [
      detectedId,
    ]);
    if (row?.status !== 'pending') {
      throw new Error('This payment was already handled.');
    }
    const saved = { ...values, source: 'notification' };
    transactionId = split
      ? await insertSplitPayment(txn, saved, split.parts, split.loansCategoryId)
      : await createTransaction(txn, saved);
    await rememberName(txn, row.counterparty, values);
    await txn.runAsync("UPDATE detected_payments SET status = 'added', transaction_id = ? WHERE id = ?", [
      transactionId,
      detectedId,
    ]);
  });
  return transactionId;
}

/**
 * Adds payments one by one ([{ id, values }]). Stops at the first failure and
 * returns it instead of throwing, so what was added can still be undone.
 * Returns { addedIds, error }.
 */
export async function addDetectedBatch(db, entries) {
  const addedIds = [];
  for (const { id, values } of entries) {
    try {
      await addDetectedAsTransaction(db, id, values);
      addedIds.push(id);
    } catch (error) {
      return { addedIds, error };
    }
  }
  return { addedIds, error: null };
}

/**
 * Undoes an Add: deletes the entry (all parts of a split) and puts the payment
 * back on Review. An entry you changed after adding it is kept, so Undo never
 * throws away an edit.
 */
export async function undoAddDetected(db, detectedId) {
  await db.withExclusiveTransactionAsync(async (txn) => {
    const row = await txn.getFirstAsync(
      'SELECT status, transaction_id AS transactionId FROM detected_payments WHERE id = ?',
      [detectedId],
    );
    if (row?.status !== 'added') {
      throw new Error('This payment can no longer be undone.');
    }
    if (row.transactionId != null) {
      const edited = await txn.getFirstAsync(
        'SELECT id FROM transactions WHERE (id = ? OR split_group = ?) AND updated_at <> created_at LIMIT 1',
        [row.transactionId, row.transactionId],
      );
      if (edited) {
        throw new Error(
          'You changed this entry after adding it, so it was kept. Delete it from the list if you no longer want it.',
        );
      }
      await txn.runAsync("DELETE FROM transactions WHERE (id = ? OR split_group = ?) AND source = 'notification'", [
        row.transactionId,
        row.transactionId,
      ]);
    }
    await txn.runAsync("UPDATE detected_payments SET status = 'pending', transaction_id = NULL WHERE id = ?", [
      detectedId,
    ]);
  });
}

export async function ignoreDetected(db, detectedId) {
  await db.runAsync("UPDATE detected_payments SET status = 'ignored' WHERE id = ? AND status = 'pending'", [
    detectedId,
  ]);
}

/** Undoes an Ignore: the payment goes back on Review. */
export async function unignoreDetected(db, detectedId) {
  await db.runAsync("UPDATE detected_payments SET status = 'pending' WHERE id = ? AND status = 'ignored'", [
    detectedId,
  ]);
}
