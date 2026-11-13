// What each waiting payment on the Review screen becomes, from the choices on its card.
// choices: { types, categories, shops }, each a map of item id -> what you picked on the card.
// data: { categories, shopAccounts }, as loaded for the screen.

import { maxReturnPaise, remainingText } from './people.js';
import { shopPaymentValues } from './shopAccounts.js';
import { categoryIdForSave } from './transactionForm.js';

/** The entry a bank payment becomes on Add. loanType when you chose I gave, Returned and so on. */
export function detectedToTransaction(detected, categoryId, loanType = null) {
  return {
    amountPaise: detected.amountPaise,
    direction: detected.direction,
    loanType,
    accountId: detected.accountId,
    purpose: null,
    categoryId,
    occurredAt: detected.postedAt,
    paymentMethod: 'UPI',
    merchant: detected.counterparty,
    reference: detected.reference,
    notes: null,
    source: 'notification',
  };
}

/**
 * "What is this?": your pick on the card, else the money back suggestion, else
 * last time's choice for this name. A loan type, 'shop' or null (expense or income).
 */
export function typeOf(item, choices, data) {
  if (item.id in choices.types) {
    return choices.types[item.id];
  }
  if (item.suggestion) {
    return item.suggestion.loanType;
  }
  if (item.possibleDuplicate) {
    return null;
  }
  if (item.rememberedShopAccountId && shopOf(item, choices, data)) {
    return 'shop';
  }
  return item.rememberedLoanType ?? null;
}

/** The loan type to save: none for a shop payment. */
export function loanTypeOf(item, choices, data) {
  const type = typeOf(item, choices, data);
  return type === 'shop' ? null : type;
}

/** The shop account a "Shop" payment goes to: your pick, last time's, or the first one. */
export function shopOf(item, choices, data) {
  const id = choices.shops[item.id] ?? item.rememberedShopAccountId;
  return data.shopAccounts.find((account) => account.id === id) ?? data.shopAccounts[0] ?? null;
}

/** The transaction the item becomes on Add. */
export function transactionFor(item, choices, data) {
  if (typeOf(item, choices, data) === 'shop') {
    const shop = shopOf(item, choices, data);
    return shopPaymentValues(shop, detectedToTransaction(item, shop.categoryId, null));
  }
  const loanType = loanTypeOf(item, choices, data);
  const categoryId = categoryIdForSave(
    { loanType, categoryId: choices.categories[item.id] ?? item.suggestedCategoryId },
    data.categories,
  );
  return detectedToTransaction(item, categoryId, loanType);
}

/**
 * True when "Add all" can save it without a question. Possible duplicates,
 * missing names, money back and shop payments need a check one at a time.
 */
export function canAddInBatch(item, choices, data) {
  const values = transactionFor(item, choices, data);
  return (
    !item.possibleDuplicate &&
    typeOf(item, choices, data) !== 'shop' &&
    values.categoryId != null &&
    (!values.loanType || Boolean(item.counterparty)) &&
    maxReturnPaise(values.loanType, 0) === null
  );
}

/** Why the card picked money back, shown while that suggestion is still picked. */
export function suggestionNote(item, choices, data) {
  const { suggestion } = item;
  if (!suggestion || loanTypeOf(item, choices, data) !== suggestion.loanType) {
    return null;
  }
  const remaining = remainingText(suggestion.person.netPaise);
  return suggestion.loanType === 'lent_repaid'
    ? `${suggestion.person.person} has ${remaining}, so this is marked as Money received back. Change it if needed.`
    : `You have ${remaining} to ${suggestion.person.person}, so this is marked as Money returned. Change it if needed.`;
}
