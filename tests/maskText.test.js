import assert from 'node:assert/strict';
import { test } from 'node:test';
import { maskSensitiveText } from '../src/utils/maskText.js';

// Made-up sample messages for testing only. Not real account data.
test('keeps amounts but hides account numbers, references and UPI IDs', () => {
  const sample = 'Rs.1,250.50 debited from A/c XX4821 on 25-10-26 to VPA test.shop@okaxis. UPI Ref 612345678901';
  assert.equal(
    maskSensitiveText(sample),
    'Rs.1,250.50 debited from A/c XXXXXX on 25-10-26 to VPA xxxx@okaxis. UPI Ref XXXXXXXXXXXX',
  );
});

test('handles ₹ and INR amounts and empty input', () => {
  assert.equal(maskSensitiveText('₹500 received from 9876543210@ybl'), '₹500 received from xxxx@ybl');
  assert.equal(maskSensitiveText('INR 20000.00 credited'), 'INR 20000.00 credited');
  assert.equal(maskSensitiveText(''), '');
  assert.equal(maskSensitiveText(null), '');
});
