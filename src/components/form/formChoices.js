// The type choice and screen title of the add/edit form.

import { takesDueDate } from '../../domain/entryTypes';

// The two choices the form offers, decided by where it was opened (see typeChoicesFor).
const TYPE_CHOICES = {
  expenses: [
    { value: 'paid', label: 'Paid' },
    { value: 'received', label: 'Received' },
  ],
  people: [
    { value: 'gave', label: 'I gave' },
    { value: 'took', label: 'I took' },
  ],
};

/**
 * The choices that fit the entry the form starts with: an expense or income
 * gets Paid | Received, money given or taken gets I gave | I took, and money
 * received back or returned gets none (null; its type is shown as text).
 */
export function typeChoicesFor(loanType) {
  if (loanType == null) {
    return TYPE_CHOICES.expenses;
  }
  // I gave and I took are the types that take a return date.
  return takesDueDate(loanType) ? TYPE_CHOICES.people : null;
}

// The screen title follows what is selected, so it always says what you are saving.
const TITLES = {
  paid: { add: 'Add Expense', edit: 'Edit Expense' },
  received: { add: 'Add Income', edit: 'Edit Income' },
  lent: { add: 'Money Given', edit: 'Edit Money Given' },
  borrowed: { add: 'Money Taken', edit: 'Edit Money Taken' },
  lent_repaid: { add: 'Money Received Back', edit: 'Edit Money Received Back' },
  borrowed_repaid: { add: 'Money Returned', edit: 'Edit Money Returned' },
};

/** "Add Expense", "Edit Money Given"... mode: 'add' or 'edit'. */
export function titleFor(form, mode) {
  if (form.shopEntry === 'payment') {
    return mode === 'edit' ? 'Edit Shop Payment' : 'Shop Payment';
  }
  const key = form.loanType ?? (form.direction === 'credit' ? 'received' : 'paid');
  return (TITLES[key] ?? TITLES.paid)[mode];
}
