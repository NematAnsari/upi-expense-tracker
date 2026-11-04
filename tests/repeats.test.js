import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupRepeats } from '../src/domain/repeats.js';

const nov = (day, hour, minute = 0) => new Date(2026, 10, day, hour, minute).getTime();

function entry(id, fields) {
  return { id, amountPaise: 3000, direction: 'debit', categoryId: 1, merchant: null, purpose: null, ...fields };
}

test('same name, category and day share one group; totals add up', () => {
  // Newest first, as the lists load them.
  const list = [
    entry(4, { merchant: 'Chocolate', occurredAt: nov(4, 18, 40) }),
    entry(3, { merchant: 'City Mart', occurredAt: nov(4, 15), amountPaise: 50000 }),
    entry(2, { merchant: ' chocolate ', occurredAt: nov(4, 13, 15) }),
    entry(1, { merchant: 'Chocolate', occurredAt: nov(4, 9, 10), amountPaise: 2000 }),
  ];
  const groups = groupRepeats(list);
  assert.equal(groups.length, 2);

  const [chocolate, cityMart] = groups;
  assert.deepEqual(
    chocolate.items.map((t) => t.id),
    [1, 2, 4],
    'earliest first inside the group; name matched ignoring case and spaces',
  );
  assert.equal(chocolate.totalPaise, 8000);
  assert.equal(chocolate.firstAt, nov(4, 9, 10));
  assert.equal(chocolate.lastAt, nov(4, 18, 40));
  assert.equal(cityMart.items.length, 1, 'a single entry is its own group');
});

test('different day, category, direction or no name are never grouped', () => {
  const list = [
    entry(1, { merchant: 'Chocolate', occurredAt: nov(4, 10) }),
    entry(2, { merchant: 'Chocolate', occurredAt: nov(3, 10) }), // another day
    entry(3, { merchant: 'Chocolate', occurredAt: nov(4, 11), categoryId: 2 }), // another category
    entry(4, { merchant: 'Chocolate', occurredAt: nov(4, 12), direction: 'credit' }), // money received
    entry(5, { occurredAt: nov(4, 13) }), // no name
    entry(6, { occurredAt: nov(4, 14) }), // no name
  ];
  assert.equal(groupRepeats(list).length, 6);
});

test('the purpose counts as the name when there is no shop or person', () => {
  const list = [
    entry(2, { purpose: 'Tea', occurredAt: nov(4, 17) }),
    entry(1, { purpose: 'tea', occurredAt: nov(4, 11) }),
  ];
  const [group] = groupRepeats(list);
  assert.equal(group.items.length, 2);
});
