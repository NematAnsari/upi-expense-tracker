import { PAYMENT_METHODS } from '../constants/categories.js';
import { parseAmountToPaise } from '../utils/money.js';
import { isValidLoanType } from './loans.js';

// Small tolerance so a timestamp taken a moment ago is never flagged as "future".
const FUTURE_TOLERANCE_MS = 60 * 1000;

export const MAX_CATEGORY_NAME_LENGTH = 30;

// 'debit' = money paid (an expense). 'credit' = money received (income).
export const DIRECTIONS = ['debit', 'credit'];

function optionalText(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Validates raw form values.
 * Returns { errors } (field -> message) and, when valid, clean `values`
 * object ready to save.
 */
export function validateTransactionForm(form, now = Date.now()) {
  const errors = {};

  const amount = parseAmountToPaise(form.amountText);
  if (amount.error) {
    errors.amount = amount.error;
  }

  if (!Number.isInteger(form.categoryId)) {
    errors.category = 'Choose a category.';
  }

  if (!PAYMENT_METHODS.includes(form.paymentMethod)) {
    errors.paymentMethod = 'Choose a payment method.';
  }

  const direction = form.direction ?? 'debit';
  if (!DIRECTIONS.includes(direction)) {
    errors.direction = 'Choose whether money was paid or received.';
  }

  const loanType = form.loanType ?? null;
  if (!isValidLoanType(loanType, direction)) {
    errors.loanType = 'Choose what this payment is.';
  } else if (loanType && !optionalText(form.merchant)) {
    // Loans are tracked per person, so the name is needed.
    errors.merchant = "Enter the person's name.";
  }

  if (!Number.isFinite(form.occurredAt)) {
    errors.occurredAt = 'Choose a date and time.';
  } else if (form.occurredAt > now + FUTURE_TOLERANCE_MS) {
    errors.occurredAt = 'Date and time cannot be in the future.';
  }

  if (Object.keys(errors).length > 0) {
    return { errors, values: null };
  }

  return {
    errors,
    values: {
      amountPaise: amount.paise,
      direction,
      loanType,
      accountId: Number.isInteger(form.accountId) ? form.accountId : null,
      purpose: optionalText(form.purpose),
      categoryId: form.categoryId,
      occurredAt: form.occurredAt,
      paymentMethod: form.paymentMethod,
      merchant: optionalText(form.merchant),
      reference: optionalText(form.reference),
      notes: optionalText(form.notes),
    },
  };
}

/**
 * A template needs a category. The amount is optional (useful when it varies,
 * like petrol), but if one is entered it must be valid.
 */
export function validateTemplateForm(form) {
  const errors = {};
  let amountPaise = null;

  if (String(form.amountText ?? '').trim() !== '') {
    const amount = parseAmountToPaise(form.amountText);
    if (amount.error) {
      errors.amount = amount.error;
    } else {
      amountPaise = amount.paise;
    }
  }
  if (!Number.isInteger(form.categoryId)) {
    errors.category = 'Choose a category to save a template.';
  }
  if (Object.keys(errors).length > 0) {
    return { errors, template: null };
  }

  return {
    errors,
    template: {
      amountPaise,
      categoryId: form.categoryId,
      purpose: optionalText(form.purpose),
      merchant: optionalText(form.merchant),
      paymentMethod: PAYMENT_METHODS.includes(form.paymentMethod) ? form.paymentMethod : PAYMENT_METHODS[0],
    },
  };
}

export function validateCategoryName(rawName) {
  const name = String(rawName ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  if (name === '') {
    return { error: 'Enter a category name.' };
  }
  if (name.length > MAX_CATEGORY_NAME_LENGTH) {
    return { error: `Keep it under ${MAX_CATEGORY_NAME_LENGTH} characters.` };
  }
  return { name };
}
