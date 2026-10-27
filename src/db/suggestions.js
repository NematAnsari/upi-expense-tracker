// Suggestions learned from your own past expenses. Nothing leaves the phone.
//
// These queries group case-insensitively ("D-Mart" and "d-mart" are one merchant).
// With MAX(created_at) in the query, SQLite takes the other columns (the
// spelling and category) from the most recent matching expense.

const DEFAULT_LIMIT = 4;

/** Past merchants containing `text`, most used first. Empty text returns nothing. */
export async function suggestMerchants(db, text, limit = DEFAULT_LIMIT) {
  const term = text?.trim().toLowerCase();
  if (!term) {
    return [];
  }
  return db.getAllAsync(
    `SELECT merchant AS value, category_id AS categoryId, COUNT(*) AS uses, MAX(created_at) AS lastUsedAt
     FROM transactions
     WHERE merchant IS NOT NULL AND instr(lower(merchant), ?) > 0 AND lower(merchant) <> ?
     GROUP BY lower(merchant)
     ORDER BY uses DESC, lastUsedAt DESC
     LIMIT ?`,
    [term, term, limit],
  );
}

/**
 * Past purposes. With text: purposes containing it, the chosen category's first.
 * Without text: the most used purposes for the chosen category.
 */
export async function suggestPurposes(db, text, categoryId, limit = DEFAULT_LIMIT) {
  const term = text?.trim().toLowerCase() ?? '';
  if (!term && categoryId == null) {
    return [];
  }

  const where = ['purpose IS NOT NULL', 'instr(lower(purpose), ?) > 0', 'lower(purpose) <> ?'];
  const params = [term, term];
  if (!term) {
    where.push('category_id = ?');
    params.push(categoryId);
  }
  params.push(categoryId ?? -1, limit);

  return db.getAllAsync(
    `SELECT purpose AS value, category_id AS categoryId, COUNT(*) AS uses, MAX(created_at) AS lastUsedAt
     FROM transactions
     WHERE ${where.join(' AND ')}
     GROUP BY lower(purpose)
     ORDER BY (category_id = ?) DESC, uses DESC, lastUsedAt DESC
     LIMIT ?`,
    params,
  );
}

/** Payment method of the most recently entered expense, or null if there are none. */
export async function getLastPaymentMethod(db) {
  const row = await db.getFirstAsync(
    'SELECT payment_method AS paymentMethod FROM transactions ORDER BY created_at DESC, id DESC LIMIT 1',
  );
  return row?.paymentMethod ?? null;
}
