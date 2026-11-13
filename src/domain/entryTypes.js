// The kinds of entry, and how a row describes itself.
//
// Money given and taken is stored with a loan_type (these values are saved on
// the phone, so they never change). None of it is spending or income:
//   lent             I gave money          money out   shows under Money to receive
//   borrowed         I took money          money in    shows under Money to return
//   lent_repaid      Money received back   money in    lowers Money to receive
//   borrowed_repaid  Money returned        money out   lowers Money to return
// The screen never says loan, lend, borrow, owe or repay.

/**
 * Wording for each type. choice: on pickers. label: short, in lists.
 * addLabel: the Review card's button. note: shown under the choice.
 */
export const LOAN_TYPES = {
  lent: {
    direction: 'debit',
    choice: 'I gave money',
    label: 'Gave money',
    addLabel: 'Add as money given',
    note: 'Not counted as spending. Shows under Money to receive.',
  },
  borrowed_repaid: {
    direction: 'debit',
    choice: 'Money returned',
    label: 'Money returned',
    addLabel: 'Add as money returned',
    note: 'Not counted as spending. Lowers your Money to return.',
  },
  borrowed: {
    direction: 'credit',
    choice: 'I took money',
    label: 'Took money',
    addLabel: 'Add as money taken',
    note: 'Not counted as income. Shows under Money to return.',
  },
  lent_repaid: {
    direction: 'credit',
    choice: 'Money received back',
    label: 'Money received back',
    addLabel: 'Add as money received back',
    note: 'Not counted as income. Lowers your Money to receive.',
  },
};

/** True when the type fits the direction (I gave is money out...). No type always fits. */
export function isValidLoanType(loanType, direction) {
  return loanType == null || LOAN_TYPES[loanType]?.direction === direction;
}

/** Money received back or money returned. */
export function isReturnType(loanType) {
  return loanType === 'lent_repaid' || loanType === 'borrowed_repaid';
}

/** I gave or I took: the types that start an amount and can have a "return by" date. */
export function takesDueDate(loanType) {
  return loanType === 'lent' || loanType === 'borrowed';
}

/** Short label for lists ("Gave money"...), or null for an expense or income. */
export function loanLabel(loanType) {
  return LOAN_TYPES[loanType]?.label ?? null;
}

// How a title starts, before the name: "Gave money to Amit".
const TITLE_PREFIX = {
  lent: 'Gave money to',
  borrowed: 'Took money from',
  lent_repaid: 'Money received back from',
  borrowed_repaid: 'Money returned to',
};

/**
 * An entry in plain words, for confirmations: "Paid to XYZ Store",
 * "Gave money to Amit". Without a name: the purpose, the type, or the category.
 */
export function activityTitle({ direction, loanType, merchant, purpose, categoryName }) {
  if (merchant) {
    const prefix = TITLE_PREFIX[loanType] ?? (direction === 'credit' ? 'Received from' : 'Paid to');
    return `${prefix} ${merchant}`;
  }
  return purpose || loanLabel(loanType) || categoryName;
}

/** How an entry was paid, for list rows: "UPI · BOI ••2222", "Cash", or "Pay later" (taken at a shop, not paid yet). */
export function paymentText({ paymentMethod, accountName, shopEntry }) {
  if (shopEntry === 'purchase') {
    return 'Pay later';
  }
  return [paymentMethod, accountName].filter(Boolean).join(' · ');
}
