// Pure helpers for the expense form. No React or database code here, so they
// can be tested on their own.

import { DEFAULT_PAYMENT_METHOD, PAYMENT_METHODS } from '../constants/categories.js';
import { paiseToInputString } from '../utils/money.js';

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
