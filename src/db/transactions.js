// Saving, reading and deleting entries (expenses, income, money given and
// taken, shop items and payments).

import { NEEDS_PURPOSE, NOT_SHOP_PAYMENT, placeholders } from './sql.js';

export const SELECT_TRANSACTION = `
  SELECT
    t.id,
    t.amount_paise AS amountPaise,
    t.direction,
    t.purpose,
    t.category_id AS categoryId,
    c.name AS categoryName,
    t.occurred_at AS occurredAt,
    t.payment_method AS paymentMethod,
    t.merchant,
    t.reference,
    t.notes,
    t.source_text AS sourceText,
    t.account_id AS accountId,
    a.nickname AS accountName,
    t.loan_type AS loanType,
    t.due_at AS dueAt,
    t.split_group AS splitGroup,
    t.shop_account_id AS shopAccountId,
    t.shop_entry AS shopEntry,
    s.name AS shopName
  FROM transactions t
  JOIN categories c ON c.id = t.category_id
  LEFT JOIN accounts a ON a.id = t.account_id
  LEFT JOIN shop_accounts s ON s.id = t.shop_account_id
`;

// What each `kind` filter keeps. Expenses and income leave out money given or
// taken and shop payments.
const KIND_FILTERS = {
  regular: [`t.loan_type IS NULL AND ${NOT_SHOP_PAYMENT}`],
  paid: [`t.loan_type IS NULL AND ${NOT_SHOP_PAYMENT} AND t.direction = ?`, 'debit'],
  received: [`t.loan_type IS NULL AND ${NOT_SHOP_PAYMENT} AND t.direction = ?`, 'credit'],
  given: ["t.loan_type IN ('lent', 'lent_repaid')"],
  taken: ["t.loan_type IN ('borrowed', 'borrowed_repaid')"],
};

/**
 * Lists entries, newest first unless sort is 'asc'. All filters are optional:
 * - startMs, endMs: time range (end not included)
 * - kind: 'regular' (expenses and income), 'paid', 'received', 'given' or 'taken'
 * - categoryId, accountId, paymentMethod, direction: one of each
 * - search: part of the purpose or name, any case
 * - missingPurpose: only expenses that still need a purpose
 * - loansOnly: only money given or taken; person: only this person's
 * - limit: at most this many
 */
export async function listTransactions(db, filters = {}) {
  const {
    startMs,
    endMs,
    categoryId,
    search,
    missingPurpose,
    accountId,
    paymentMethod,
    direction,
    loansOnly,
    person,
    kind,
    sort = 'desc',
    limit,
  } = filters;
  const where = [];
  const params = [];
  const add = (condition, ...values) => {
    where.push(condition);
    params.push(...values);
  };

  if (startMs != null && endMs != null) {
    add('t.occurred_at >= ? AND t.occurred_at < ?', startMs, endMs);
  }
  if (categoryId != null) {
    add('t.category_id = ?', categoryId);
  }
  const term = search?.trim().toLowerCase();
  if (term) {
    // instr() is a plain text match, so % and _ in a search are not wildcards.
    add("(instr(lower(coalesce(t.purpose, '')), ?) > 0 OR instr(lower(coalesce(t.merchant, '')), ?) > 0)", term, term);
  }
  if (missingPurpose) {
    add(NEEDS_PURPOSE);
  }
  if (accountId != null) {
    add('t.account_id = ?', accountId);
  }
  if (paymentMethod != null) {
    add('t.payment_method = ?', paymentMethod);
  }
  if (direction != null) {
    add('t.direction = ?', direction);
  }
  if (loansOnly) {
    add('t.loan_type IS NOT NULL');
  }
  if (person != null) {
    add('lower(trim(t.merchant)) = lower(trim(?))', person);
  }
  if (KIND_FILTERS[kind]) {
    add(...KIND_FILTERS[kind]);
  }

  const order = sort === 'asc' ? 'ASC' : 'DESC';
  let sql = `${SELECT_TRANSACTION}
    ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY t.occurred_at ${order}, t.id ${order}`;
  if (limit != null) {
    sql += ' LIMIT ?';
    params.push(limit);
  }
  return db.getAllAsync(sql, params);
}

export async function getTransaction(db, id) {
  return db.getFirstAsync(`${SELECT_TRANSACTION} WHERE t.id = ?`, [id]);
}

/** Saves a new entry and returns its id. direction defaults to 'debit' (money paid). */
export async function createTransaction(db, values) {
  const now = Date.now();
  const result = await db.runAsync(
    `INSERT INTO transactions
      (amount_paise, direction, purpose, category_id, occurred_at, payment_method, merchant, reference, notes,
       account_id, loan_type, due_at, split_group, shop_account_id, shop_entry, source, source_text, created_at,
       updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      values.amountPaise,
      values.direction ?? 'debit',
      values.purpose,
      values.categoryId,
      values.occurredAt,
      values.paymentMethod,
      values.merchant,
      values.reference,
      values.notes,
      values.accountId ?? null,
      values.loanType ?? null,
      values.dueAt ?? null,
      values.splitGroup ?? null,
      values.shopAccountId ?? null,
      values.shopEntry ?? null,
      values.source ?? 'manual',
      values.sourceText ?? null,
      now,
      now,
    ],
  );
  return result.lastInsertRowId;
}

/** Saves changes to an entry. Its split and shop links are kept as they are. */
export async function updateTransaction(db, id, values) {
  const result = await db.runAsync(
    `UPDATE transactions SET
      amount_paise = ?, direction = ?, purpose = ?, category_id = ?, occurred_at = ?, payment_method = ?,
      merchant = ?, reference = ?, notes = ?, source_text = ?, account_id = ?, loan_type = ?, due_at = ?,
      updated_at = ?
     WHERE id = ?`,
    [
      values.amountPaise,
      values.direction ?? 'debit',
      values.purpose,
      values.categoryId,
      values.occurredAt,
      values.paymentMethod,
      values.merchant,
      values.reference,
      values.notes,
      values.sourceText ?? null,
      values.accountId ?? null,
      values.loanType ?? null,
      values.dueAt ?? null,
      Date.now(),
      id,
    ],
  );
  if (result.changes === 0) {
    throw new Error('This transaction no longer exists. It may have been deleted.');
  }
}

/**
 * Deletes entries together. A payment that came from a bank SMS goes back to
 * Review, so it is not later mistaken for a duplicate of something deleted.
 */
export async function deleteTransactions(db, ids) {
  if (ids.length === 0) {
    return;
  }
  const list = placeholders(ids.length);
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      `UPDATE detected_payments SET status = 'pending', transaction_id = NULL
       WHERE status = 'added' AND transaction_id IN (${list})`,
      ids,
    );
    await txn.runAsync(`DELETE FROM transactions WHERE id IN (${list})`, ids);
  });
}
