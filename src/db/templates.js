const SELECT_TEMPLATE = `
  SELECT
    tp.id,
    tp.name,
    tp.amount_paise AS amountPaise,
    tp.category_id AS categoryId,
    c.name AS categoryName,
    tp.purpose,
    tp.merchant,
    tp.payment_method AS paymentMethod
  FROM templates tp
  JOIN categories c ON c.id = tp.category_id
`;

/** Most used templates first. */
export async function listTemplates(db) {
  return db.getAllAsync(`${SELECT_TEMPLATE} ORDER BY tp.use_count DESC, tp.last_used_at DESC, tp.name`);
}

export async function getTemplate(db, id) {
  return db.getFirstAsync(`${SELECT_TEMPLATE} WHERE tp.id = ?`, [id]);
}

/**
 * Saves a template. If one with the same name exists (ignoring case), it is
 * updated instead of creating a duplicate. Returns the saved template.
 */
export async function saveTemplate(db, template) {
  await db.runAsync(
    `INSERT INTO templates (name, amount_paise, category_id, purpose, merchant, payment_method, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (name) DO UPDATE SET
       amount_paise = excluded.amount_paise,
       category_id = excluded.category_id,
       purpose = excluded.purpose,
       merchant = excluded.merchant,
       payment_method = excluded.payment_method`,
    [
      template.name,
      template.amountPaise,
      template.categoryId,
      template.purpose,
      template.merchant,
      template.paymentMethod,
      Date.now(),
    ],
  );
  return db.getFirstAsync(`${SELECT_TEMPLATE} WHERE tp.name = ?`, [template.name]);
}

export async function markTemplateUsed(db, id) {
  await db.runAsync('UPDATE templates SET use_count = use_count + 1, last_used_at = ? WHERE id = ?', [Date.now(), id]);
}

export async function deleteTemplate(db, id) {
  await db.runAsync('DELETE FROM templates WHERE id = ?', [id]);
}
