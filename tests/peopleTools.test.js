import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listCategories } from '../src/db/categories.js';
import { getLoanBalances } from '../src/db/reports.js';
import { createTransaction, listTransactions, renamePerson } from '../src/db/transactions.js';
import {
  describeNet,
  findSimilarPeople,
  openSince,
  reminderMessage,
  runningRemaining,
  settlementDates,
  sortPeople,
  suggestLoanType,
  timelineText,
} from '../src/domain/loans.js';
import { daysBetween, formatDuration, formatOrdinalDate } from '../src/utils/dates.js';
import { createTestDatabase } from './helpers/testDatabase.js';

const day = (month, date) => new Date(2026, month - 1, date, 12).getTime();

async function setup() {
  const { db } = await createTestDatabase();
  const categories = await listCategories(db);
  const id = (name) => categories.find((c) => c.name === name).id;
  function add(amountPaise, direction, loanType, merchant, occurredAt, category = 'Loans') {
    return createTransaction(db, {
      amountPaise,
      direction,
      loanType,
      merchant,
      categoryId: id(category),
      occurredAt,
      paymentMethod: 'UPI',
      purpose: null,
      reference: null,
      notes: null,
    });
  }
  return { db, add };
}

test('openSince and running remaining follow the entries in time order', () => {
  const entries = [
    { id: 3, loanType: 'lent_repaid', amountPaise: 2000, occurredAt: day(9, 1) },
    { id: 1, loanType: 'lent', amountPaise: 5000, occurredAt: day(8, 1) },
    { id: 2, loanType: 'lent_repaid', amountPaise: 5000, occurredAt: day(8, 20) }, // settled here
    { id: 4, loanType: 'lent', amountPaise: 6000, occurredAt: day(8, 25) }, // opens again
  ];
  assert.equal(openSince(entries), day(8, 25), 'the latest time it moved away from zero');
  assert.deepEqual(runningRemaining(entries), { 1: 5000, 2: 0, 4: 6000, 3: 4000 });
  assert.equal(openSince(entries.slice(1, 3)), null, 'settled: no pending date');
  // Overpaid in the past flips the side: the open amount starts at that entry.
  const flipped = [
    { id: 1, loanType: 'lent', amountPaise: 1000, occurredAt: day(1, 1) },
    { id: 2, loanType: 'lent_repaid', amountPaise: 1500, occurredAt: day(2, 1) },
  ];
  assert.equal(openSince(flipped), day(2, 1));

  // Settled after reopening: the dates belong to the last settled stretch.
  const settledTwice = [
    ...entries.slice(1, 3), // 1 Aug given, 20 Aug back: settled
    { id: 5, loanType: 'lent', amountPaise: 1000, occurredAt: day(9, 5) },
    { id: 6, loanType: 'lent_repaid', amountPaise: 1000, occurredAt: day(9, 15) },
  ];
  assert.deepEqual(settlementDates(settledTwice), {
    openSinceAt: null,
    settledAt: day(9, 15),
    settledFromAt: day(9, 5),
  });
  assert.deepEqual(settlementDates(entries), { openSinceAt: day(8, 25), settledAt: null, settledFromAt: null });

  assert.equal(describeNet(5700000), '₹57,000.00 left to receive');
  assert.equal(describeNet(-600000), '₹6,000.00 left to return');
  assert.equal(describeNet(0), 'Fully settled');
});

test('dates: ordinal day, and total time as days, months or years', () => {
  const at = (y, m, d) => new Date(y, m - 1, d, 12).getTime();
  assert.equal(formatOrdinalDate(at(2025, 10, 31)), '31st Oct 2025');
  assert.equal(formatOrdinalDate(at(2026, 8, 2)), '2nd Aug 2026');
  assert.equal(formatOrdinalDate(at(2026, 8, 3)), '3rd Aug 2026');
  assert.equal(formatOrdinalDate(at(2026, 8, 11)), '11th Aug 2026');
  assert.equal(formatOrdinalDate(at(2026, 8, 12)), '12th Aug 2026');
  assert.equal(formatOrdinalDate(at(2026, 8, 13)), '13th Aug 2026');
  assert.equal(formatOrdinalDate(at(2026, 8, 21)), '21st Aug 2026');
  assert.equal(formatOrdinalDate(at(2026, 8, 22)), '22nd Aug 2026');

  assert.equal(daysBetween(day(8, 12), day(10, 12)), 61);
  assert.equal(daysBetween(day(10, 12), new Date(2026, 9, 12, 23).getTime()), 0, 'same day, any time');

  const end = at(2026, 10, 12);
  assert.equal(formatDuration(at(2026, 10, 12), end), '0 days');
  assert.equal(formatDuration(at(2026, 10, 11), end), '1 day');
  assert.equal(formatDuration(at(2026, 9, 20), end), '22 days');
  assert.equal(formatDuration(at(2026, 9, 12), end), '1 month');
  assert.equal(formatDuration(at(2026, 8, 13), end), '1 month', 'one day short of 2 months');
  assert.equal(formatDuration(at(2026, 8, 12), end), '2 months');
  assert.equal(formatDuration(at(2025, 10, 12), end), '1 year');
  assert.equal(formatDuration(at(2024, 3, 1), end), '2 years');
});

test('date line: the icon says pending or settled, the text is date and total time', () => {
  const now = day(10, 12);
  assert.deepEqual(timelineText({ openSinceAt: day(8, 12) }, now), {
    status: 'pending',
    date: '12th Aug 2026',
    duration: '2 months',
    spoken: 'Pending since 12th Aug 2026, 2 months',
  });
  assert.equal(timelineText({ openSinceAt: day(10, 12) }, now).duration, '0 days');
  assert.deepEqual(timelineText({ settledAt: day(9, 20), settledFromAt: day(8, 12) }, now), {
    status: 'settled',
    date: '20th Sep 2026',
    duration: '1 month',
    spoken: 'Settled on 20th Sep 2026, took 1 month',
  });
  assert.equal(timelineText({ settledAt: day(9, 20), settledFromAt: day(9, 20) }, now).duration, '0 days');
  assert.equal(timelineText({}, now), null);
});

test('people can be sorted; fully settled always last', () => {
  const people = [
    { person: 'A', status: 'owesYou', amountPaise: 100, lastAt: 30, openSinceAt: 20 },
    { person: 'B', status: 'settled', amountPaise: 0, lastAt: 99, openSinceAt: null },
    { person: 'C', status: 'youOwe', amountPaise: 900, lastAt: 10, openSinceAt: 5 },
    { person: 'D', status: 'owesYou', amountPaise: 500, lastAt: 20, openSinceAt: 15 },
  ];
  const names = (mode) => sortPeople(people, mode).map((p) => p.person);
  assert.deepEqual(names('all'), ['A', 'D', 'C', 'B']);
  assert.deepEqual(names('latest'), ['A', 'D', 'C', 'B']);
  assert.deepEqual(
    sortPeople(people).map((p) => p.person),
    names('all'),
    'All is the default',
  );
  assert.deepEqual(names('largest'), ['C', 'D', 'A', 'B']);
  assert.deepEqual(names('oldest'), ['C', 'D', 'A', 'B']);
});

test('similar names are offered, exact matches and unrelated names are not', () => {
  const known = ['Rahul Kumar', 'Amit', 'Sameer Khan', 'Priya'];
  assert.deepEqual(findSimilarPeople('Rahul', known), ['Rahul Kumar']);
  assert.deepEqual(findSimilarPeople('rahul kumar', known), [], 'same name, different case');
  assert.deepEqual(findSimilarPeople('Amitt', known), ['Amit'], 'one-letter typo');
  assert.deepEqual(findSimilarPeople('Sameer K', known), ['Sameer Khan'], 'same first name');
  assert.deepEqual(findSimilarPeople('Neha', known), []);
  assert.deepEqual(findSimilarPeople('Ra', known), [], 'too short to guess');
  assert.deepEqual(findSimilarPeople('Prya', known), ['Priya']);
});

test('a detected payment from someone with money to receive suggests money received back', () => {
  const people = [
    { person: 'Mohammed Shadab', status: 'owesYou', amountPaise: 300000, netPaise: 300000 },
    { person: 'Amit', status: 'youOwe', amountPaise: 50000, netPaise: -50000 },
  ];
  const detected = (direction, counterparty, amountPaise) => ({ direction, counterparty, amountPaise });
  assert.equal(suggestLoanType(detected('credit', 'MOHAMMED SHADAB', 100000), people).loanType, 'lent_repaid');
  assert.equal(suggestLoanType(detected('debit', 'amit', 50000), people).loanType, 'borrowed_repaid');
  assert.equal(suggestLoanType(detected('credit', 'Mohammed Shadab', 300001), people), null, 'more than remaining');
  assert.equal(suggestLoanType(detected('debit', 'Mohammed Shadab', 100), people), null, 'wrong side');
  assert.equal(suggestLoanType(detected('credit', 'Someone Else', 100), people), null);
  assert.equal(suggestLoanType(detected('credit', null, 100), people), null);
});

test('reminder text is friendly and only for money to receive', () => {
  assert.equal(
    reminderMessage({ person: 'Rahul', status: 'owesYou', amountPaise: 5700000 }),
    'Hi Rahul, just a friendly reminder: ₹57,000.00 is still remaining from the money I gave you. Thank you!',
  );
  assert.equal(reminderMessage({ person: 'Amit', status: 'youOwe', amountPaise: 100 }), null);
});

test('balances include when the open amount started', async () => {
  const { db, add } = await setup();
  await add(500000, 'debit', 'lent', 'Rahul', day(8, 12));
  await add(200000, 'credit', 'lent_repaid', ' rahul ', day(9, 1));
  await add(10000, 'debit', 'lent', 'Sara', day(9, 2));
  await add(10000, 'credit', 'lent_repaid', 'Sara', day(9, 3));
  const byName = Object.fromEntries((await getLoanBalances(db)).people.map((p) => [p.person.toLowerCase(), p]));
  assert.equal(byName.rahul.openSinceAt, day(8, 12));
  assert.equal(byName.sara.openSinceAt, null);
  assert.equal(byName.sara.settledAt, day(9, 3));
  assert.equal(byName.sara.settledFromAt, day(9, 2));
});

test('rename moves all money given and taken entries, and can combine two people', async () => {
  const { db, add } = await setup();
  await add(500000, 'debit', 'lent', 'Rahul', day(8, 1));
  await add(100000, 'credit', 'lent_repaid', 'RAHUL', day(8, 2));
  await add(300000, 'debit', 'lent', 'Rahul Kumar', day(8, 3));
  await add(9900, 'debit', null, 'Rahul', day(8, 4), 'Shopping'); // an expense with the same name

  assert.equal(await renamePerson(db, 'rahul', '  Rahul   Kumar '), 2);
  const people = (await getLoanBalances(db)).people;
  assert.equal(people.length, 1, 'combined into one person');
  assert.equal(people[0].person, 'Rahul Kumar');
  assert.equal(people[0].amountPaise, 700000);
  const expense = (await listTransactions(db, { kind: 'paid' }))[0];
  assert.equal(expense.merchant, 'Rahul', 'expenses keep their name');
  await assert.rejects(() => renamePerson(db, 'Rahul Kumar', '   '), /Enter a name/);
});
