import { validateCategoryName } from '../domain/validation.js';

/**
 * All categories in their display order. `lastUsedAt` is when an expense in
 * that category was last entered (null if never), used to show recent ones first.
 */
export async function listCategories(db) {
  return db.getAllAsync(
    `SELECT c.id, c.name, MAX(t.created_at) AS lastUsedAt
     FROM categories c
     LEFT JOIN transactions t ON t.category_id = c.id
     GROUP BY c.id, c.name
     ORDER BY c.sort_order, c.name`,
  );
}

/** Adds a custom category at the end of the list. Returns { id, name, lastUsedAt }. */
export async function createCategory(db, rawName) {
  const { name, error } = validateCategoryName(rawName);
  if (error) {
    throw new Error(error);
  }

  const existing = await db.getFirstAsync('SELECT id FROM categories WHERE name = ?', [name]);
  if (existing) {
    throw new Error(`A category called "${name}" already exists.`);
  }

  const result = await db.runAsync(
    `INSERT INTO categories (name, is_default, sort_order, created_at)
     VALUES (?, 0, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories), ?)`,
    [name, Date.now()],
  );
  return { id: result.lastInsertRowId, name, lastUsedAt: null };
}
