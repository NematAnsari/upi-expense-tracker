// Pure helpers for the transaction form. No React or database code here, so
// they can be tested on their own.

import { DEFAULT_PAYMENT_METHOD, PAYMENT_METHODS } from '../constants/categories.js';
import { paiseToInputString } from '../utils/money.js';
import { LOANS_CATEGORY } from './loans.js';

export const QUICK_CATEGORY_COUNT = 6;

/**
 * The categories shown before "More": recently used first, then the default
 * order. The selected category is always included. The order does not change
 * when you tap a chip, so nothing jumps around under your finger.
 */
export function pickVisibleCategories(categories, selectedId, limit = QUICK_CATEGORY_COUNT) {
  const recent = categories
    .filter((category) => category.lastUsedAt != null)
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt);

  const visible = [];
  const seen = new Set();
  for (const category of [...recent, ...categories]) {
    if (visible.length >= limit) {
      break;
    }
    if (!seen.has(category.id)) {
      visible.push(category);
      seen.add(category.id);
    }
  }

  const selected = categories.find((category) => category.id === selectedId);
  if (selected && !seen.has(selected.id)) {
    visible.push(selected);
  }
  return visible;
}

export function createEmptyTransactionForm(lastPaymentMethod) {
  return {
    amountText: '',
    direction: 'debit',
    loanType: null,
    accountId: null,
    purpose: '',
    categoryId: null,
    occurredAt: Date.now(),
    paymentMethod: PAYMENT_METHODS.includes(lastPaymentMethod) ? lastPaymentMethod : DEFAULT_PAYMENT_METHOD,
    merchant: '',
    reference: '',
    notes: '',
  };
}

/**
 * The four answers to "What happened?" on the form. Each one is a direction
 * plus an optional loan type. Money received back and money returned are
 * recorded from a person's page instead, so they are not in this list.
 */
export const ACTIVITIES = [
  { key: 'paid', label: 'I paid money', direction: 'debit', loanType: null },
  { key: 'received', label: 'I received money', direction: 'credit', loanType: null },
  { key: 'gave', label: 'I gave money', direction: 'debit', loanType: 'lent' },
  { key: 'took', label: 'I took money', direction: 'credit', loanType: 'borrowed' },
];

/** The activity a form is showing, or null for money received back / returned. */
export function activityFor(form) {
  const direction = form.direction ?? 'debit';
  const loanType = form.loanType ?? null;
  return ACTIVITIES.find((activity) => activity.direction === direction && activity.loanType === loanType) ?? null;
}

/** Categories you can pick by hand. "Loans" is set automatically for loans, so it is not offered. */
export function pickableCategories(categories) {
  return categories.filter((category) => category.name.toLowerCase() !== LOANS_CATEGORY.toLowerCase());
}

/** For a loan the category is always "Loans"; otherwise the chosen one is kept. */
export function categoryIdForSave(form, categories) {
  if (!form.loanType) {
    return form.categoryId;
  }
  const loans = categories.find((category) => category.name.toLowerCase() === LOANS_CATEGORY.toLowerCase());
  return loans?.id ?? form.categoryId;
}

/** Fills the form from a template. Keeps a typed amount if the template has none. */
export function applyTemplate(form, template) {
  return {
    ...form,
    amountText: template.amountPaise != null ? paiseToInputString(template.amountPaise) : form.amountText,
    categoryId: template.categoryId,
    purpose: template.purpose ?? '',
    merchant: template.merchant ?? '',
    paymentMethod: template.paymentMethod,
  };
}

/** A short name for a template: its purpose, else merchant, else category. */
export function buildTemplateName(template, categoryName) {
  return (template.purpose || template.merchant || categoryName).slice(0, 40);
}
