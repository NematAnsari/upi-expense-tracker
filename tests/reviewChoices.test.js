import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canAddInBatch,
  loanTypeOf,
  shopOf,
  suggestionNote,
  transactionFor,
  typeOf,
} from '../src/domain/reviewChoices.js';

const data = {
  categories: [
    { id: 1, name: 'Food' },
    { id: 2, name: 'Loans' },
  ],
  shopAccounts: [
    { id: 10, name: 'Tea Stall', categoryId: 1 },
    { id: 11, name: 'Milk Shop', categoryId: 1 },
  ],
};
const noChoices = { types: {}, categories: {}, shops: {} };

function item(extra = {}) {
  return {
    id: 1,
    amountPaise: 5000,
    direction: 'debit',
    accountId: 3,
    postedAt: 1000,
    counterparty: 'Test Person',
    reference: 'REF1',
    suggestedCategoryId: 1,
    possibleDuplicate: false,
    suggestion: null,
    rememberedLoanType: null,
    rememberedShopAccountId: null,
    ...extra,
  };
}

test('the type comes from your pick, then the suggestion, then last time', () => {
  const suggested = item({
    suggestion: { loanType: 'borrowed_repaid', person: { person: 'Test Person', netPaise: -9000 } },
  });
  assert.equal(typeOf(suggested, noChoices, data), 'borrowed_repaid');
  assert.equal(typeOf(suggested, { ...noChoices, types: { 1: null } }, data), null, 'your pick wins, even "none"');
  assert.equal(typeOf(item({ rememberedLoanType: 'lent' }), noChoices, data), 'lent');
  assert.equal(typeOf(item({ possibleDuplicate: true, rememberedLoanType: 'lent' }), noChoices, data), null);
  assert.equal(typeOf(item({ rememberedShopAccountId: 11 }), noChoices, data), 'shop');
});

test('a shop payment goes to your pick, last time, or the first shop', () => {
  assert.equal(shopOf(item(), noChoices, data).id, 10);
  assert.equal(shopOf(item({ rememberedShopAccountId: 11 }), noChoices, data).id, 11);
  assert.equal(shopOf(item({ rememberedShopAccountId: 11 }), { ...noChoices, shops: { 1: 10 } }, data).id, 10);
  assert.equal(shopOf(item(), noChoices, { ...data, shopAccounts: [] }), null);
});

test('the transaction follows the choices', () => {
  const shop = transactionFor(item(), { ...noChoices, types: { 1: 'shop' } }, data);
  assert.equal(shop.shopEntry, 'payment');
  assert.equal(shop.shopAccountId, 10);
  assert.equal(shop.loanType, null);
  assert.equal(loanTypeOf(item(), { ...noChoices, types: { 1: 'shop' } }, data), null);

  const given = transactionFor(item(), { ...noChoices, types: { 1: 'lent' } }, data);
  assert.equal(given.loanType, 'lent');
  assert.equal(given.categoryId, 2, 'money given goes under Loans');

  const expense = transactionFor(item(), { ...noChoices, categories: { 1: 1 } }, data);
  assert.equal(expense.loanType, null);
  assert.equal(expense.categoryId, 1);
});

test('"Add all" skips anything that needs a check', () => {
  assert.equal(canAddInBatch(item(), noChoices, data), true);
  assert.equal(canAddInBatch(item({ possibleDuplicate: true }), noChoices, data), false);
  assert.equal(canAddInBatch(item({ suggestedCategoryId: null }), noChoices, data), false);
  assert.equal(canAddInBatch(item({ counterparty: null }), { ...noChoices, types: { 1: 'lent' } }, data), false);
  assert.equal(canAddInBatch(item(), { ...noChoices, types: { 1: 'borrowed_repaid' } }, data), false);
  assert.equal(canAddInBatch(item(), { ...noChoices, types: { 1: 'shop' } }, data), false);
});

test('the suggestion note shows only while the suggestion is picked', () => {
  const suggested = item({
    direction: 'credit',
    suggestion: { loanType: 'lent_repaid', person: { person: 'Test Person', netPaise: 9000 } },
  });
  assert.match(suggestionNote(suggested, noChoices, data), /^Test Person has .+ Money received back/);
  assert.equal(suggestionNote(suggested, { ...noChoices, types: { 1: null } }, data), null);
  assert.equal(suggestionNote(item(), noChoices, data), null);
});
