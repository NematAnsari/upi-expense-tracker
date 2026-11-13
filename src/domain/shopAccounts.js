// A shop account works like the diary you keep with a tea shop:
//   each tea adds to what is due (and is spending on its day),
//   paying the shop lowers what is due (and is not spending again),
//   whatever is left at the end of a month carries over to the next.
//   Oct: carried ₹0 + teas ₹3,000 − paid ₹2,000 = ₹1,000 due
//   Nov: carried ₹1,000 + teas ₹1,500 − paid ₹0 = ₹2,500 due

import { getMonthKey, shiftMonth } from '../utils/dates.js';

const EMPTY_MONTH = { purchasesPaise: 0, count: 0, paidPaise: 0 };

/**
 * Paying the shop: lowers what is due. `values` is a transaction (amount,
 * method, bank account, date...); the shop fields are set here.
 */
export function shopPaymentValues(account, values) {
  return {
    ...values,
    direction: 'debit',
    loanType: null,
    categoryId: account.categoryId,
    merchant: account.name,
    shopAccountId: account.id,
    shopEntry: 'payment',
  };
}

/**
 * Month by month, oldest first, up to `now`'s month. The amount already due
 * when the account was made counts as carried into the first month.
 * account: { openingDuePaise, createdAt }. entries: [{ shopEntry, amountPaise, occurredAt }].
 * Returns { duePaise, months: [{ monthKey, carriedInPaise, purchasesPaise, count, paidPaise, duePaise }] }.
 */
export function shopStatement(account, entries, now = new Date()) {
  const byMonth = {};
  for (const entry of entries) {
    const key = getMonthKey(new Date(entry.occurredAt));
    const month = (byMonth[key] ??= { ...EMPTY_MONTH });
    if (entry.shopEntry === 'payment') {
      month.paidPaise += entry.amountPaise;
    } else {
      month.purchasesPaise += entry.amountPaise;
      month.count += 1;
    }
  }
  const keys = Object.keys(byMonth);
  if (account.createdAt != null) {
    keys.push(getMonthKey(new Date(account.createdAt)));
  }
  const lastKey = getMonthKey(now);
  // Month keys ("2026-11") sort in date order as plain text.
  const firstKey = keys.length > 0 ? keys.sort()[0] : lastKey;

  const months = [];
  let carried = account.openingDuePaise ?? 0;
  for (let key = firstKey > lastKey ? lastKey : firstKey; key <= lastKey; key = shiftMonth(key, 1)) {
    const month = byMonth[key] ?? EMPTY_MONTH;
    const due = carried + month.purchasesPaise - month.paidPaise;
    months.push({ monthKey: key, carriedInPaise: carried, ...month, duePaise: due });
    carried = due;
  }
  return { duePaise: carried, months };
}
