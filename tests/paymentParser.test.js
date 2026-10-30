import assert from 'node:assert/strict';
import { test } from 'node:test';
import { suggestCategoryName } from '../src/domain/categorize.js';
import { parsePaymentNotification } from '../src/domain/paymentParser.js';

// All sample messages here are made up or have real details replaced with fake
// ones. They copy the FORMAT of real bank SMS, not anyone's actual data.

test('Kotak credit SMS (format from a real message)', () => {
  const result = parsePaymentNotification({
    title: 'JD-KOTAKB-S',
    text: 'Received Rs.1.00 in your kotak bank AC 1111 from TEST PERSON on 27-10-26. UPI Ref:600000000001',
  });
  assert.deepEqual(result, {
    direction: 'credit',
    amountPaise: 100,
    bankName: 'Kotak Mahindra Bank',
    bankShort: 'Kotak',
    accountLast4: '1111',
    counterparty: 'TEST PERSON',
    reference: '600000000001',
  });
});

test('BOI debit SMS that also says "credited to" (format from a real message)', () => {
  const result = parsePaymentNotification({
    title: 'JX-BOIIND-S',
    text: 'Rs.1.00 debited A/cXX2222 and credited to TEST NAME via UPI Ref No 600000000002 on 27Oct26. Call 18000000000, if not done by you. -BOI',
  });
  assert.equal(result.direction, 'debit');
  assert.equal(result.amountPaise, 100);
  assert.equal(result.bankName, 'Bank of India');
  assert.equal(result.accountLast4, '2222');
  assert.equal(result.counterparty, 'TEST NAME');
  assert.equal(result.reference, '600000000002');
});

test('common debit wording with a UPI ID (made-up example)', () => {
  const result = parsePaymentNotification({
    title: 'AD-KOTAKB-S',
    text: 'Sent Rs.1,250.50 from Kotak Bank AC X7777 to test.shop@okaxis on 27-10-26.UPI Ref 600000000003. Not you, call 18000000000',
  });
  assert.equal(result.direction, 'debit');
  assert.equal(result.amountPaise, 125050);
  assert.equal(result.accountLast4, '7777');
  assert.equal(result.counterparty, 'test.shop@okaxis');
  assert.equal(result.reference, '600000000003');
  assert.equal(result.bankShort, 'Kotak');
});

test("the other party's UPI handle does not decide your bank", () => {
  const result = parsePaymentNotification({
    title: 'VM-BOBTXN-S',
    text: 'Rs.500.00 debited from A/c ...4444 to friend@kotak on 27-10-26. UPI Ref No 600000000004 -Bank of Baroda',
  });
  assert.equal(result.bankName, 'Bank of Baroda');
  assert.equal(result.counterparty, 'friend@kotak');
  assert.equal(result.accountLast4, '4444');
});

test('missing fields stay null instead of being guessed', () => {
  const result = parsePaymentNotification({ title: 'Google Pay', text: '₹250 paid successfully' });
  assert.equal(result.direction, 'debit');
  assert.equal(result.amountPaise, 25000);
  assert.equal(result.bankName, null);
  assert.equal(result.accountLast4, null);
  assert.equal(result.counterparty, null);
  assert.equal(result.reference, null);
});

test('rejects failed payments, requests, reminders and non-payments', () => {
  for (const text of [
    'Payment of Rs.100 to TEST failed. Amount will be refunded if debited',
    'TEST PERSON has requested Rs.200 via UPI',
    'Rs.999 will be debited from your account on 01-11-26 for autopay',
    'Your credit card bill of Rs.5000 is due on 05-11-26',
    'Hello, how are you?',
    'Rs.0.00 debited',
  ]) {
    assert.equal(parsePaymentNotification({ title: 'X', text }), null, text);
  }
});

test('Google Pay "NAME paid you" is money received, name from the title (format from a real message)', () => {
  const result = parsePaymentNotification({ title: 'TEST PERSON paid you ₹1.00', text: 'Payment from PhonePe' });
  assert.equal(result.direction, 'credit');
  assert.equal(result.amountPaise, 100);
  assert.equal(result.counterparty, 'TEST PERSON');
  assert.equal(result.bankName, null);
  assert.equal(result.reference, null);

  const tapToView = parsePaymentNotification({ title: 'TEST PERSON paid you ₹250.00', text: 'Tap to view.' });
  assert.equal(tapToView.direction, 'credit');
  assert.equal(tapToView.amountPaise, 25000);
});

test('BOI credit "by UPI ref No." does not treat "UPI ref" as a name (format from a real message)', () => {
  const result = parsePaymentNotification({
    title: 'JM-BOIIND-S',
    text: 'BOI -  Rs.1.00 Credited to your Ac XX2222 on 27-10-26 by UPI ref No.600000000020.Avl Bal 12345.90',
  });
  assert.equal(result.direction, 'credit');
  assert.equal(result.amountPaise, 100, 'the balance is not mistaken for the amount');
  assert.equal(result.bankName, 'Bank of India');
  assert.equal(result.accountLast4, '2222');
  assert.equal(result.counterparty, null);
  assert.equal(result.reference, '600000000020');
});

test('Google Pay "You paid ... to NAME" is money spent (made-up example)', () => {
  const result = parsePaymentNotification({ title: 'Google Pay', text: 'You paid ₹120.00 to TEST SHOP' });
  assert.equal(result.direction, 'debit');
  assert.equal(result.counterparty, 'TEST SHOP');
});

// The next four use the common public formats of these banks' UPI alerts, with
// made-up numbers and names. Real messages from your phone may differ slightly.

test('Bank of Baroda "Dr." / "Cr." debit is understood', () => {
  const result = parsePaymentNotification({
    title: 'BP-BOBTXN-S',
    text: 'Rs.250.00 Dr. from A/C XXXXXX4444 and Cr. to test.shop@ybl. Ref:600000000030. AvlBal:Rs1200.50(2026:10:28 10:15:00). Not you? Call 18000000000 -BOB',
  });
  assert.equal(result.direction, 'debit');
  assert.equal(result.amountPaise, 25000, 'the balance is not mistaken for the amount');
  assert.equal(result.bankName, 'Bank of Baroda');
  assert.equal(result.accountLast4, '4444');
  assert.equal(result.counterparty, 'test.shop@ybl');
  assert.equal(result.reference, '600000000030');
});

test('Bank of Baroda credit "thru UPI/<ref> by <UPI ID>" is understood', () => {
  const result = parsePaymentNotification({
    title: 'BP-BOBSMS-S',
    text: 'Rs.500.00 Credited to A/c ...4444 thru UPI/600000000031 by friend@okaxis. Total Bal:Rs.1700.50 CR. -BOB',
  });
  assert.equal(result.direction, 'credit');
  assert.equal(result.amountPaise, 50000);
  assert.equal(result.counterparty, 'friend@okaxis');
  assert.equal(result.reference, '600000000031');
});

test('SBI debit with no currency sign ("debited by 20.0") is understood', () => {
  const result = parsePaymentNotification({
    title: 'AD-SBIUPI-S',
    text: 'Dear UPI user A/C X5555 debited by 20.0 on date 28Oct26 trf to TEST SHOP Refno 600000000032. If not u? call 1800000000. -SBI',
  });
  assert.equal(result.direction, 'debit');
  assert.equal(result.amountPaise, 2000);
  assert.equal(result.bankName, 'State Bank of India');
  assert.equal(result.accountLast4, '5555');
  assert.equal(result.counterparty, 'TEST SHOP');
  assert.equal(result.reference, '600000000032');
});

test('SBI credit "credited by Rs.500 ... transfer from NAME" is understood', () => {
  const result = parsePaymentNotification({
    title: 'AD-SBIINB-S',
    text: 'Dear SBI User, your A/c X5555-credited by Rs.500 on 28Oct26 transfer from TEST PERSON Ref No 600000000033 -SBI',
  });
  assert.equal(result.direction, 'credit');
  assert.equal(result.amountPaise, 50000);
  assert.equal(result.counterparty, 'TEST PERSON');
  assert.equal(result.reference, '600000000033');
});

test('category suggestions: keywords, income, unknown', () => {
  assert.equal(suggestCategoryName('INDIAN OIL PETROL PUMP', 'debit'), 'Petrol & Transport');
  assert.equal(suggestCategoryName('dmart.store@ybl', 'debit'), 'Groceries');
  assert.equal(suggestCategoryName('Swiggy', 'debit'), 'Food & Dining');
  assert.equal(suggestCategoryName('Coca Cola Agency', 'debit'), 'Uncategorized', '"ola" must not match "Cola"');
  assert.equal(suggestCategoryName('TEST PERSON', 'debit'), 'Uncategorized');
  assert.equal(suggestCategoryName(null, 'debit'), 'Uncategorized');
  assert.equal(suggestCategoryName('Anyone', 'credit'), 'Income');
});
