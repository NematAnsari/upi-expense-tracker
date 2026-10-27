import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  averagePaise,
  formatINR,
  MAX_AMOUNT_PAISE,
  paiseToInputString,
  parseAmountToPaise,
  percentOf,
} from '../src/utils/money.js';

test('parses valid amounts into exact paise', () => {
  assert.deepEqual(parseAmountToPaise('250'), { paise: 25000 });
  assert.deepEqual(parseAmountToPaise('99.5'), { paise: 9950 });
  assert.deepEqual(parseAmountToPaise('99.50'), { paise: 9950 });
  assert.deepEqual(parseAmountToPaise('0.01'), { paise: 1 });
  assert.deepEqual(parseAmountToPaise('.5'), { paise: 50 });
  assert.deepEqual(parseAmountToPaise('1,250.75'), { paise: 125075 });
  assert.deepEqual(parseAmountToPaise(' ₹ 1,00,000 '), { paise: 10000000 });
  assert.deepEqual(parseAmountToPaise('12.'), { paise: 1200 });
});

test('avoids floating point drift', () => {
  const sum = parseAmountToPaise('0.1').paise + parseAmountToPaise('0.2').paise;
  assert.equal(sum, 30);
  assert.equal(formatINR(sum), '₹0.30');
});

test('rejects invalid, zero, negative and oversized amounts', () => {
  for (const input of ['', '   ', 'abc', '-50', '1.234', '1.2.3', '12a', '1e5', '.']) {
    assert.ok(parseAmountToPaise(input).error, `expected error for "${input}"`);
  }
  assert.match(parseAmountToPaise('0').error, /more than/);
  assert.match(parseAmountToPaise('0.00').error, /more than/);
  assert.ok(parseAmountToPaise(String(MAX_AMOUNT_PAISE / 100 + 1)).error);
  assert.deepEqual(parseAmountToPaise(String(MAX_AMOUNT_PAISE / 100)), { paise: MAX_AMOUNT_PAISE });
  assert.ok(parseAmountToPaise('99999999999').error);
});

test('formats Indian currency with lakh/crore grouping', () => {
  assert.equal(formatINR(0), '₹0.00');
  assert.equal(formatINR(5), '₹0.05');
  assert.equal(formatINR(125000), '₹1,250.00');
  assert.equal(formatINR(99999), '₹999.99');
  assert.equal(formatINR(10000000), '₹1,00,000.00');
  assert.equal(formatINR(1234567801), '₹1,23,45,678.01');
  assert.equal(formatINR(-125000), '-₹1,250.00');
});

test('converts paise back to an editable string', () => {
  assert.equal(paiseToInputString(25000), '250');
  assert.equal(paiseToInputString(9950), '99.50');
  assert.equal(paiseToInputString(1), '0.01');
});

test('averages and percentages handle zero', () => {
  assert.equal(averagePaise(0, 0), 0);
  assert.equal(averagePaise(1000, 3), 333);
  assert.equal(averagePaise(1001, 2), 501);
  assert.equal(percentOf(50, 0), 0);
  assert.equal(percentOf(25, 100), 25);
});
