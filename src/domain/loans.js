// Money lent and borrowed.
//
// A loan moves money, but it is not spending or income:
//   lent            you gave money to someone (they owe you)       money paid
//   lent_repaid     they paid you back (they owe you less)        money received
//   borrowed        someone gave you money (you owe them)         money received
//   borrowed_repaid you paid them back (you owe them less)        money paid
//
// Loan rows are kept out of spending and income totals and summed per person.

export const LOANS_CATEGORY = 'Loans';

export const LOAN_TYPES = {
  lent: {
    direction: 'debit',
    label: 'Lent',
    personLabel: 'Lent to',
    addLabel: 'Add as money lent',
    note: 'Not counted as spending. This person will owe you this amount.',
  },
  borrowed_repaid: {
    direction: 'debit',
    label: 'Paid back',
    personLabel: 'Paid back to',
    addLabel: 'Add as loan paid back',
    note: 'Not counted as spending. It lowers how much you owe this person.',
  },
  borrowed: {
    direction: 'credit',
    label: 'Borrowed',
    personLabel: 'Borrowed from',
    addLabel: 'Add as money borrowed',
    note: 'Not counted as income. You will owe this person this amount.',
  },
  lent_repaid: {
    direction: 'credit',
    label: 'Got paid back',
    personLabel: 'Paid back by',
    addLabel: 'Add as loan returned',
    note: 'Not counted as income. It lowers how much this person owes you.',
  },
};

/** The "What is this?" choices for money paid or received. `value: null` = normal expense/income. */
export function loanChoicesFor(direction) {
  const normal = { value: null, label: direction === 'credit' ? 'Income' : 'Expense' };
  const loans = Object.entries(LOAN_TYPES)
    .filter(([, type]) => type.direction === direction)
    .map(([value, type]) => ({ value, label: type.label }));
  return [normal, ...loans];
}

export function isValidLoanType(loanType, direction) {
  return loanType == null || LOAN_TYPES[loanType]?.direction === direction;
}

/** Short label for lists ("Lent", "Borrowed"...), or null for a normal transaction. */
export function loanLabel(loanType) {
  return LOAN_TYPES[loanType]?.label ?? null;
}

/**
 * Turns one person's loan total into what to show.
 * netPaise > 0: they owe you. netPaise < 0: you owe them. 0: settled.
 */
export function describeBalance(netPaise) {
  if (netPaise > 0) {
    return { status: 'owesYou', amountPaise: netPaise };
  }
  if (netPaise < 0) {
    return { status: 'youOwe', amountPaise: -netPaise };
  }
  return { status: 'settled', amountPaise: 0 };
}
