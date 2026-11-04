// Split payment: one payment where part was yours and part was paid for other
// people (a ₹1,000 train ticket: ₹500 your travel, ₹500 for a friend).
// Your share is saved as an expense; each other share as money given to that
// person, so it shows under Money to receive on Given & Taken.

import { parseAmountToPaise } from '../utils/money.js';

/** A new, empty "their share" line for the form. `key` keeps list rows stable. */
export function emptySplit(key) {
  return { key, merchant: '', amountText: '' };
}

/**
 * Checks the other people's shares against the total paid.
 * Returns { error } (one message for the split card) or
 * { parts: [{ merchant, amountPaise }], myPaise } when it adds up.
 * Your share must be above zero: when all of it was for others, "I gave" fits better.
 */
export function validateSplits(totalPaise, splits) {
  const parts = [];
  for (const [index, split] of splits.entries()) {
    const merchant = String(split.merchant ?? '')
      .trim()
      .replace(/\s+/g, ' ');
    const amount = parseAmountToPaise(split.amountText);
    if (!merchant) {
      return { error: `Enter a name for person ${index + 1}.` };
    }
    if (amount.error) {
      return { error: `${merchant}: ${amount.error}` };
    }
    parts.push({ merchant, amountPaise: amount.paise });
  }
  const othersPaise = parts.reduce((sum, part) => sum + part.amountPaise, 0);
  const myPaise = totalPaise - othersPaise;
  if (myPaise <= 0) {
    return { error: 'Their shares add up to the whole amount or more. Use "I gave" if none of it was yours.' };
  }
  return { parts, myPaise };
}

/** Your share for the line under the split card, or null while the amounts are not valid yet. */
export function previewMyShare(totalText, splits) {
  const total = parseAmountToPaise(totalText);
  if (total.error) {
    return null;
  }
  let othersPaise = 0;
  for (const split of splits) {
    const amount = parseAmountToPaise(split.amountText);
    if (!amount.error) {
      othersPaise += amount.paise;
    }
  }
  return total.paise - othersPaise;
}
