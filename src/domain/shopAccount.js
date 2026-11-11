// A shop account works like the diary you keep with a tea shop:
//   each tea adds to what is due (and is spending on its day),
//   paying the shop lowers what is due (and is not spending again),
//   whatever is left at the end of a month carries over to the next.
//   Oct: carried ₹0 + teas ₹3,000 − paid ₹2,000 = ₹1,000 due
//   Nov: carried ₹1,000 + teas ₹1,500 − paid ₹0 = ₹2,500 due

import { getMonthKey, shiftMonth } from '../utils/dates.js';

/**
 * Month by month, oldest first, from the first month with anything in it up
 * to `now`'s month. account: { openingDuePaise, createdAt } (the opening due
 * counts as carried into the first month). entries: [{ shopEntry, amountPaise, occurredAt }].
 * Returns { duePaise, months: [{ monthKey, carriedInPaise, purchasesPaise, count, paidPaise, duePaise }] }.
 */
export function shopStatement(account, entries, now = new Date()) {
  const byMonth = {};
  for (const entry of entries) {
    const key = getMonthKey(new Date(entry.occurredAt));
    const month = (byMonth[key] ??= { purchasesPaise: 0, count: 0, paidPaise: 0 });
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
  let key = keys.length > 0 ? keys.sort()[0] : lastKey;
  if (key > lastKey) {
    key = lastKey;
  }

  const months = [];
  let carried = account.openingDuePaise ?? 0;
  for (; key <= lastKey; key = shiftMonth(key, 1)) {
    const month = byMonth[key] ?? { purchasesPaise: 0, count: 0, paidPaise: 0 };
    const due = carried + month.purchasesPaise - month.paidPaise;
    months.push({ monthKey: key, carriedInPaise: carried, ...month, duePaise: due });
    carried = due;
  }
  return { duePaise: carried, months };
}

/** "38 times" / "1 time": how often you took something from the shop. */
export function countText(count) {
  return `${count} ${count === 1 ? 'time' : 'times'}`;
}

/**
 * How an entry was paid, for list rows: "UPI · BOI ••2222", "Cash", or
 * "Pay later" for something taken on a shop account and not paid yet.
 */
export function paymentText({ paymentMethod, accountName, shopEntry }) {
  if (shopEntry === 'purchase') {
    return 'Pay later';
  }
  return [paymentMethod, accountName].filter(Boolean).join(' · ');
}
