import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { createCategory, listCategories } from '../src/db/categories.js';
import { LATEST_VERSION, MIGRATIONS, migrateDbIfNeeded } from '../src/db/migrations.js';
import { getDashboardData } from '../src/db/reports.js';
import { getLastPaymentMethod, suggestMerchants, suggestPurposes } from '../src/db/suggestions.js';
import { deleteTemplate, listTemplates, markTemplateUsed, saveTemplate } from '../src/db/templates.js';
import { createTransaction, listTransactions } from '../src/db/transactions.js';
import {
  applyTemplate,
  buildTemplateName,
  createEmptyTransactionForm,
  pickVisibleCategories,
} from '../src/domain/transactionForm.js';
import { validateCategoryName, validateTemplateForm } from '../src/domain/validation.js';
import { createTestDatabase, wrapDatabase } from './helpers/testDatabase.js';

const oct = (day, hour = 12) => new Date(2026, 9, day, hour).getTime();

async function setup() {
  const { db, raw } = await createTestDatabase();
  const categories = await listCategories(db);
  const categoryId = (name) => categories.find((c) => c.name === name).id;
  let clock = 1000;

  // Inserts directly so each row gets a distinct, increasing created_at.
  async function add(fields) {
    clock += 1000;
    const id = await createTransaction(db, {
      amountPaise: 10000,
      purpose: null,
      merchant: null,
      reference: null,
      notes: null,
      paymentMethod: 'UPI',
      occurredAt: oct(10),
      ...fields,
      categoryId: categoryId(fields.category ?? 'Other'),
    });
    raw.prepare('UPDATE transactions SET created_at = ? WHERE id = ?').run(clock, id);
    return id;
  }
  return { db, raw, categoryId, add };
}

test('upgrading a Phase 1 database keeps existing expenses', async () => {
  const raw = new DatabaseSync(':memory:');
  const db = wrapDatabase(raw);

  // Build a version 1 database by hand, exactly as Phase 1 left it.
  await db.withExclusiveTransactionAsync(async (txn) => {
    await MIGRATIONS[0](txn);
    await txn.execAsync('PRAGMA user_version = 1');
  });
  const rentId = (await db.getFirstAsync("SELECT id FROM categories WHERE name = 'Rent'")).id;
  // Plain SQL with only version 1 columns, exactly as the Phase 1 app saved it.
  await db.runAsync(
    `INSERT INTO transactions (amount_paise, purpose, category_id, occurred_at, payment_method, created_at, updated_at)
     VALUES (1500000, 'October rent', ?, ?, 'UPI', 0, 0)`,
    [rentId, oct(1)],
  );

  await migrateDbIfNeeded(db);

  assert.equal(raw.prepare('PRAGMA user_version').get().user_version, LATEST_VERSION);
  const rows = await listTransactions(db);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].purpose, 'October rent');
  assert.equal(rows[0].amountPaise, 1500000);
  assert.deepEqual(await listTemplates(db), []);
});

test('recently used categories come first and chips never reorder on selection', async () => {
  const { db, add, categoryId } = await setup();
  let visible = pickVisibleCategories(await listCategories(db), null);
  assert.deepEqual(
    visible.map((c) => c.name),
    ['Food & Dining', 'Groceries', 'Petrol & Transport', 'Shopping', 'Bills & Utilities', 'Rent'],
  );

  await add({ category: 'Health' });
  await add({ category: 'Travel' });
  await add({ category: 'Health' });
  const categories = await listCategories(db);
  visible = pickVisibleCategories(categories, null);
  assert.deepEqual(
    visible.slice(0, 3).map((c) => c.name),
    ['Health', 'Travel', 'Food & Dining'],
  );
  assert.equal(visible.length, 6);

  // Selecting a visible chip keeps the same list; a hidden selection is appended.
  assert.deepEqual(pickVisibleCategories(categories, categoryId('Travel')), visible);
  const withHidden = pickVisibleCategories(categories, categoryId('Transfers'));
  assert.equal(withHidden.length, 7);
  assert.equal(withHidden.at(-1).name, 'Transfers');
});

test('merchant suggestions: case-insensitive, most used first, latest spelling and category', async () => {
  const { db, add, categoryId } = await setup();
  await add({ merchant: 'd-mart', category: 'Shopping' });
  await add({ merchant: 'D-Mart', category: 'Groceries' });
  await add({ merchant: 'D-Mart', category: 'Groceries' });
  await add({ merchant: 'Martin Pharmacy', category: 'Health' });
  await add({ merchant: 'Indian Oil', category: 'Petrol & Transport' });

  const results = await suggestMerchants(db, 'MART');
  assert.deepEqual(
    results.map((r) => [r.value, r.uses]),
    [
      ['D-Mart', 3],
      ['Martin Pharmacy', 1],
    ],
  );
  assert.equal(results[0].categoryId, categoryId('Groceries'));

  assert.deepEqual(await suggestMerchants(db, ''), []);
  assert.deepEqual(await suggestMerchants(db, 'zzz'), []);
  // An exact match is already typed, so it is not suggested again.
  assert.deepEqual(
    (await suggestMerchants(db, 'd-mart')).map((r) => r.value),
    [],
  );
});

test('purpose suggestions: by category when empty, category matches first when typing', async () => {
  const { db, add, categoryId } = await setup();
  await add({ purpose: 'Lunch', category: 'Food & Dining' });
  await add({ purpose: 'Lunch', category: 'Food & Dining' });
  await add({ purpose: 'Dinner', category: 'Food & Dining' });
  await add({ purpose: 'Lunch box', category: 'Shopping' });
  await add({ purpose: 'Lunch box', category: 'Shopping' });
  await add({ purpose: 'Lunch box', category: 'Shopping' });

  const food = categoryId('Food & Dining');
  assert.deepEqual(
    (await suggestPurposes(db, '', food)).map((r) => r.value),
    ['Lunch', 'Dinner'],
  );
  assert.deepEqual(
    (await suggestPurposes(db, 'lun', food)).map((r) => r.value),
    ['Lunch', 'Lunch box'],
  );
  assert.deepEqual(
    (await suggestPurposes(db, 'lun', null)).map((r) => r.value),
    ['Lunch box', 'Lunch'],
  );
  assert.deepEqual(await suggestPurposes(db, '', null), []);
});

test('last payment method follows the most recently entered expense', async () => {
  const { db, add } = await setup();
  assert.equal(await getLastPaymentMethod(db), null);
  await add({ paymentMethod: 'Card' });
  await add({ paymentMethod: 'Cash' });
  assert.equal(await getLastPaymentMethod(db), 'Cash');
  assert.equal(createEmptyTransactionForm('Cash').paymentMethod, 'Cash');
  assert.equal(createEmptyTransactionForm(null).paymentMethod, 'UPI');
});

test('templates: save, update by name, usage order, delete', async () => {
  const { db, categoryId } = await setup();
  const petrol = await saveTemplate(db, {
    name: 'Petrol',
    amountPaise: null,
    categoryId: categoryId('Petrol & Transport'),
    purpose: 'Petrol',
    merchant: 'Indian Oil',
    paymentMethod: 'UPI',
  });
  const tea = await saveTemplate(db, {
    name: 'Tea',
    amountPaise: 2000,
    categoryId: categoryId('Food & Dining'),
    purpose: 'Tea',
    merchant: null,
    paymentMethod: 'Cash',
  });
  assert.equal(petrol.categoryName, 'Petrol & Transport');

  // Same name, different case: updates instead of duplicating.
  await saveTemplate(db, { ...petrol, name: 'PETROL', amountPaise: 50000 });
  let templates = await listTemplates(db);
  assert.equal(templates.length, 2);
  assert.equal(templates.find((t) => t.id === petrol.id).amountPaise, 50000);

  await markTemplateUsed(db, tea.id);
  templates = await listTemplates(db);
  assert.equal(templates[0].name, 'Tea');

  await deleteTemplate(db, tea.id);
  assert.deepEqual(
    (await listTemplates(db)).map((t) => t.name),
    ['Petrol'],
  );
});

test('applying a template fills the form and keeps a typed amount when it has none', () => {
  const form = { ...createEmptyTransactionForm('UPI'), amountText: '730', notes: 'keep me' };
  const filled = applyTemplate(form, {
    amountPaise: null,
    categoryId: 3,
    purpose: 'Petrol',
    merchant: null,
    paymentMethod: 'Card',
  });
  assert.equal(filled.amountText, '730');
  assert.equal(filled.categoryId, 3);
  assert.equal(filled.merchant, '');
  assert.equal(filled.paymentMethod, 'Card');
  assert.equal(filled.notes, 'keep me');

  assert.equal(applyTemplate(form, { amountPaise: 2050, categoryId: 1, paymentMethod: 'UPI' }).amountText, '20.50');
  assert.equal(buildTemplateName({ purpose: null, merchant: 'Indian Oil' }, 'Petrol & Transport'), 'Indian Oil');
  assert.equal(buildTemplateName({ purpose: null, merchant: null }, 'Rent'), 'Rent');
});

test('template validation: category required, amount optional but must be valid', () => {
  assert.ok(validateTemplateForm({ amountText: '', categoryId: null }).errors.category);
  assert.ok(validateTemplateForm({ amountText: 'abc', categoryId: 1 }).errors.amount);
  const ok = validateTemplateForm({ amountText: '', categoryId: 1, purpose: ' Tea ', paymentMethod: 'Cash' });
  assert.deepEqual(ok.template, {
    amountPaise: null,
    categoryId: 1,
    purpose: 'Tea',
    merchant: null,
    paymentMethod: 'Cash',
  });
});

test('custom categories: trimmed, unique ignoring case, added at the end', async () => {
  const { db } = await setup();
  const pets = await createCategory(db, '  Pet   care ');
  assert.equal(pets.name, 'Pet care');
  const names = (await listCategories(db)).map((c) => c.name);
  assert.equal(names.at(-1), 'Pet care');

  await assert.rejects(createCategory(db, 'pet CARE'), /already exists/);
  await assert.rejects(createCategory(db, 'groceries'), /already exists/);
  await assert.rejects(createCategory(db, '   '), /Enter a category name/);
  assert.ok(validateCategoryName('x'.repeat(31)).error);
});

test('expenses missing a purpose can be counted and listed', async () => {
  const { db, add } = await setup();
  await add({ purpose: 'Lunch', category: 'Food & Dining' });
  await add({ purpose: null, merchant: 'Unknown shop' });
  await add({ purpose: null, occurredAt: new Date(2026, 8, 5).getTime() }); // September

  const dashboard = await getDashboardData(db, '2026-10', new Date(2026, 9, 25));
  assert.equal(dashboard.missingPurposeCount, 1);

  const { startMs, endMs } = { startMs: oct(1, 0), endMs: new Date(2026, 10, 1).getTime() };
  const missing = await listTransactions(db, { startMs, endMs, missingPurpose: true });
  assert.deepEqual(
    missing.map((t) => t.merchant),
    ['Unknown shop'],
  );
  assert.equal((await listTransactions(db, { missingPurpose: true })).length, 2);
});
