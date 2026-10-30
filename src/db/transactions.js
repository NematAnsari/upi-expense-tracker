// Every query uses `?` placeholders. Values are passed separately, never pasted
// into the SQL string, which prevents SQL injection and quoting bugs.

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
    t.account_id AS accountId,
    a.nickname AS accountName,
    t.loan_type AS loanType
  FROM transactions t
  JOIN categories c ON c.id = t.category_id
  LEFT JOIN accounts a ON a.id = t.account_id
`;

/**
 * Lists transactions with optional filters.
 * startMs/endMs: time range (end exclusive). categoryId: one category.
 * search: matches purpose or merchant, case-insensitive. sort: 'desc' | 'asc'.
 * missingPurpose: only expenses with no purpose yet, so they can be filled in.
 * accountId: one bank account. direction: 'debit' (paid) or 'credit' (received).
 * loansOnly: only money lent, borrowed or paid back.
 */
export async function listTransactions(db, filters = {}) {
  const {
    startMs,
    endMs,
    categoryId,
    search,
    missingPurpose,
    accountId,
    direction,
    loansOnly,
    sort = 'desc',
    limit,
  } = filters;
  const where = [];
  const params = [];

  if (startMs != null && endMs != null) {
    where.push('t.occurred_at >= ? AND t.occurred_at < ?');
    params.push(startMs, endMs);
  }
  if (categoryId != null) {
    where.push('t.category_id = ?');
    params.push(categoryId);
  }
  const term = search?.trim().toLowerCase();
  if (term) {
    // instr() does a plain substring match, so % and _ in the search are not wildcards.
    where.push("(instr(lower(coalesce(t.purpose, '')), ?) > 0 OR instr(lower(coalesce(t.merchant, '')), ?) > 0)");
    params.push(term, term);
  }
  if (missingPurpose) {
    // Incoming money and loans do not need a purpose to be complete.
    where.push("t.purpose IS NULL AND t.direction = 'debit' AND t.loan_type IS NULL");
  }
  if (accountId != null) {
    where.push('t.account_id = ?');
    params.push(accountId);
  }
  if (direction != null) {
    where.push('t.direction = ?');
    params.push(direction);
  }
  if (loansOnly) {
    where.push('t.loan_type IS NOT NULL');
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

/**
 * `values` comes from validateTransactionForm. Returns the new transaction id.
 * direction defaults to 'debit' (money spent); 'credit' is money received.
 */
export async function createTransaction(db, values) {
  const now = Date.now();
  const result = await db.runAsync(
    `INSERT INTO transactions
      (amount_paise, direction, purpose, category_id, occurred_at, payment_method, merchant, reference, notes,
       account_id, loan_type, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      values.source ?? 'manual',
      now,
      now,
    ],
  );
  return result.lastInsertRowId;
}

export async function updateTransaction(db, id, values) {
  const result = await db.runAsync(
    `UPDATE transactions SET
      amount_paise = ?, direction = ?, purpose = ?, category_id = ?, occurred_at = ?, payment_method = ?,
      merchant = ?, reference = ?, notes = ?, account_id = ?, loan_type = ?, updated_at = ?
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
      values.accountId ?? null,
      values.loanType ?? null,
      Date.now(),
      id,
    ],
  );
  if (result.changes === 0) {
    throw new Error('This transaction no longer exists. It may have been deleted.');
  }
}

export async function deleteTransaction(db, id) {
  await db.runAsync('DELETE FROM transactions WHERE id = ?', [id]);
}
