// Repeat purchases, such as chocolate three times a day, shown as one row.
// Only the list changes: every purchase stays its own transaction, so totals,
// UPI matching, edit and delete work as before.

import { getDayKey } from '../utils/dates.js';

/** The name a row shows (same as TransactionRow's title, without the category fallback). */
function nameOf(transaction) {
  return (transaction.merchant || transaction.purpose || '').trim().toLowerCase();
}

/**
 * Folds entries with the same name, category and direction on the same day
 * into one group. Entries without a name are never grouped.
 * Groups keep the list's order (each sits where its first entry was); inside
 * a group the entries run from the earliest time to the latest.
 * Returns [{ key, items, totalPaise, direction, firstAt, lastAt }]; a group of
 * one is a normal row.
 */
export function groupRepeats(transactions) {
  const groups = [];
  const byKey = new Map();
  for (const transaction of transactions) {
    const name = nameOf(transaction);
    const key = name
      ? // A payment to a shop account never joins the teas it pays for.
        `${getDayKey(transaction.occurredAt)}|${name}|${transaction.categoryId}|${transaction.direction}|${transaction.shopEntry ?? ''}`
      : `id|${transaction.id}`;
    let group = byKey.get(key);
    if (!group) {
      group = { key, items: [], totalPaise: 0, direction: transaction.direction };
      byKey.set(key, group);
      groups.push(group);
    }
    group.items.push(transaction);
    group.totalPaise += transaction.amountPaise;
  }
  return groups.map((group) => {
    const items = [...group.items].sort((a, b) => a.occurredAt - b.occurredAt);
    return { ...group, items, firstAt: items[0].occurredAt, lastAt: items.at(-1).occurredAt };
  });
}
