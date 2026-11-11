// Every query uses `?` placeholders. Values are passed separately, never pasted
// into the SQL string, which prevents SQL injection and quoting bugs.

// Paying a shop account only lowers what is due there; it is never spending.
export const NOT_SHOP_PAYMENT = "t.shop_entry IS NOT 'payment'";

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

/**
 * Lists transactions with optional filters.
 * startMs/endMs: time range (end exclusive). categoryId: one category.
 * search: matches purpose or merchant, case-insensitive. sort: 'desc' | 'asc'.
 * missingPurpose: only expenses with no purpose yet, so they can be filled in.
 * accountId: one bank account. direction: 'debit' (paid) or 'credit' (received).
 * paymentMethod: one method ('UPI', 'Cash', 'Card' or 'Other').
 * loansOnly: only money lent, borrowed or paid back.
 * person: only this name, ignoring case and spaces at the ends (as getLoanBalances matches people).
 * kind: 'regular' (expenses and income), 'paid' (expenses), 'received' (income),
 * 'given' (money given and received back) or 'taken' (money taken and returned).
 * Regular, paid and received leave money given and taken out.
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
    // Tea on a shop account is named by the shop, so it needs no purpose either.
    where.push("t.purpose IS NULL AND t.direction = 'debit' AND t.loan_type IS NULL AND t.shop_entry IS NULL");
  }
  if (accountId != null) {
    where.push('t.account_id = ?');
    params.push(accountId);
  }
  if (paymentMethod != null) {
    where.push('t.payment_method = ?');
    params.push(paymentMethod);
  }
  if (direction != null) {
    where.push('t.direction = ?');
    params.push(direction);
  }
  if (loansOnly) {
    where.push('t.loan_type IS NOT NULL');
  }
  if (person != null) {
    where.push('lower(trim(t.merchant)) = lower(trim(?))');
    params.push(person);
  }
  // Payments to a shop account are not spending (the teas already were), so they are left out too.
  if (kind === 'regular') {
    where.push(`t.loan_type IS NULL AND ${NOT_SHOP_PAYMENT}`);
  } else if (kind === 'paid' || kind === 'received') {
    where.push(`t.loan_type IS NULL AND ${NOT_SHOP_PAYMENT} AND t.direction = ?`);
    params.push(kind === 'paid' ? 'debit' : 'credit');
  } else if (kind === 'given') {
    where.push("t.loan_type IN ('lent', 'lent_repaid')");
  } else if (kind === 'taken') {
    where.push("t.loan_type IN ('borrowed', 'borrowed_repaid')");
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
       account_id, loan_type, due_at, split_group, shop_account_id, shop_entry, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      merchant = ?, reference = ?, notes = ?, account_id = ?, loan_type = ?, due_at = ?, updated_at = ?
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
 * Saves one payment split into parts: `values` is your own share (an expense),
 * `parts` are the shares paid for other people, each saved as money given
 * ([{ merchant, amountPaise }]). Everything else (date, method, account,
 * reference) is copied from `values`. All parts share split_group = the id of
 * your share, so they can be found (and undone) together. All or nothing.
 * `loansCategoryId`: the "Loans" category for the given parts.
 * Returns the id of your share.
 */
export async function createSplitPayment(db, values, parts, loansCategoryId) {
  let firstId = null;
  await db.withExclusiveTransactionAsync(async (txn) => {
    firstId = await insertSplitPayment(txn, values, parts, loansCategoryId);
  });
  return firstId;
}

/** createSplitPayment without its own transaction, for callers already inside one. */
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

/**
 * The parts of a split payment: every entry that shares the split group
 * (your share and the shares for other people), your share first.
 */
export async function listSplitParts(db, splitGroup) {
  return db.getAllAsync(
    `SELECT id, amount_paise AS amountPaise, merchant, loan_type AS loanType
     FROM transactions WHERE split_group = ? ORDER BY id`,
    [splitGroup],
  );
}

/**
 * Deletes entries together. A payment that came from a bank SMS goes back to
 * Review (waiting) instead of staying marked as added, so it can be reviewed
 * again and is not mistaken for a duplicate of something that no longer exists.
 */
export async function deleteTransactions(db, ids) {
  if (ids.length === 0) {
    return;
  }
  const marks = ids.map(() => '?').join(', ');
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      `UPDATE detected_payments SET status = 'pending', transaction_id = NULL
       WHERE status = 'added' AND transaction_id IN (${marks})`,
      ids,
    );
    await txn.runAsync(`DELETE FROM transactions WHERE id IN (${marks})`, ids);
  });
}

/**
 * Renames a person on all their money given and taken entries (matched like
 * getLoanBalances: ignoring case and spaces at the ends). When the new name is
 * already someone else's, their entries end up together: that is a merge.
 * Expenses and income with the same name are not touched. Names remembered
 * from bank SMS follow too, so the next payment comes in under the new name.
 * Returns how many entries changed.
 */
export async function renamePerson(db, oldName, newName) {
  const name = newName.trim().replace(/\s+/g, ' ');
  if (!name) {
    throw new Error('Enter a name.');
  }
  const result = await db.runAsync(
    `UPDATE transactions SET merchant = ?, updated_at = ?
     WHERE loan_type IS NOT NULL AND lower(trim(merchant)) = lower(trim(?))`,
    [name, Date.now(), oldName],
  );
  await db.runAsync(
    'UPDATE name_memory SET merchant = ?, updated_at = ? WHERE lower(trim(merchant)) = lower(trim(?))',
    [name, Date.now(), oldName],
  );
  return result.changes;
}
