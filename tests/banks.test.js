import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BANKS, findBank } from '../src/domain/banks.js';

const bankOf = (title, text = '') => findBank(title, text)?.short ?? null;

test('longer bank names win over names they contain', () => {
  assert.equal(bankOf('', 'Rs.100 debited from your State Bank of India account'), 'SBI');
  assert.equal(bankOf('', 'Rs.100 credited to Union Bank of India A/c XX1234'), 'Union');
  assert.equal(bankOf('', 'Central Bank of India: Rs.100 debited'), 'Central');
  assert.equal(bankOf('', 'Rs.100 debited - Bank of India'), 'BOI');
  assert.equal(bankOf('', 'Indian Overseas Bank: Rs.100 debited'), 'IOB');
  assert.equal(bankOf('', 'Indian Bank: Rs.100 debited'), 'Indian Bank');
  assert.equal(bankOf('', 'South Indian Bank: Rs.100 debited'), 'SIB');
  assert.equal(bankOf('', 'City Union Bank: Rs.100 debited'), 'CUB');
  assert.equal(bankOf('', 'Union Bank: Rs.100 debited'), 'Union');
  assert.equal(bankOf('', 'Punjab & Sind Bank: Rs.100 debited'), 'PSB');
  assert.equal(bankOf('', 'Punjab National Bank: Rs.100 debited'), 'PNB');
});

test('banks are found by name in the text', () => {
  const cases = {
    'Canara Bank': 'Canara',
    'Bank of Maharashtra': 'BoM',
    'UCO Bank': 'UCO',
    'IDBI Bank': 'IDBI',
    'HDFC Bank': 'HDFC',
    'ICICI Bank': 'ICICI',
    'Axis Bank': 'Axis',
    'Kotak Mahindra Bank': 'Kotak',
    'IndusInd Bank': 'IndusInd',
    'Yes Bank': 'Yes Bank',
    'IDFC FIRST Bank': 'IDFC First',
    'Federal Bank': 'Federal',
    'RBL Bank': 'RBL',
    'Bandhan Bank': 'Bandhan',
    'South Indian Bank': 'SIB',
    'Karnataka Bank': 'Karnataka',
    'Karur Vysya Bank': 'KVB',
    'City Union Bank': 'CUB',
    'AU Small Finance Bank': 'AU',
    'Equitas Small Finance Bank': 'Equitas',
    'Ujjivan Small Finance Bank': 'Ujjivan',
    'Paytm Payments Bank': 'Paytm PB',
    'Airtel Payments Bank': 'Airtel PB',
    'India Post Payments Bank': 'IPPB',
    'Jio Payments Bank': 'Jio PB',
    'Standard Chartered': 'SC',
    HSBC: 'HSBC',
    'DBS Bank': 'DBS',
    Citibank: 'Citi',
  };
  for (const [name, short] of Object.entries(cases)) {
    assert.equal(bankOf('', `Rs.100 debited from your ${name} account`), short, name);
  }
});

test('banks are found by common SMS sender IDs', () => {
  assert.equal(bankOf('JD-KOTAKB-S'), 'Kotak');
  assert.equal(bankOf('JX-BOIIND-S'), 'BOI');
  assert.equal(bankOf('BP-BOBTXN-S'), 'BOB');
  assert.equal(bankOf('AD-SBIUPI-S'), 'SBI');
  assert.equal(bankOf('VM-ATMSBI'), 'SBI');
  assert.equal(bankOf('VK-PNBSMS-S'), 'PNB');
  assert.equal(bankOf('AX-CANBNK-S'), 'Canara');
  assert.equal(bankOf('VM-UNIONB-S'), 'Union');
  assert.equal(bankOf('AD-HDFCBK-S'), 'HDFC');
  assert.equal(bankOf('VM-ICICIB-S'), 'ICICI');
  assert.equal(bankOf('AX-AXISBK-S'), 'Axis');
  assert.equal(bankOf('VM-YESBNK-S'), 'Yes Bank');
  assert.equal(bankOf('AD-IDFCFB-S'), 'IDFC First');
  assert.equal(bankOf('VM-INDUSB-S'), 'IndusInd');
  assert.equal(bankOf('AD-FEDBNK-S'), 'Federal');
});

test('UPI apps and UPI IDs do not decide the bank', () => {
  assert.equal(bankOf('Paytm', 'You paid ₹50 to TEST SHOP'), null, 'the Paytm app is not Paytm Payments Bank');
  assert.equal(bankOf('Google Pay', 'TEST PERSON paid you ₹1.00'), null);
  assert.equal(bankOf('', 'Rs.100 sent to friend@okhdfcbank'), null, 'the other person’s UPI handle');
  assert.equal(bankOf('', 'Rs.100 sent to friend@kotak'), null);
});

test('every bank has a name, a short label and at least one pattern', () => {
  for (const bank of BANKS) {
    assert.ok(bank.name && bank.short && bank.patterns.length > 0, bank.name);
  }
  const shorts = BANKS.map((bank) => bank.short);
  assert.equal(new Set(shorts).size, shorts.length, 'short labels are unique');
});
