// Reads a bank or UPI payment notification and pulls out what it can.
// Banks word their messages differently and change them over time, so this
// is best-effort: any field may be missing, and unknown formats return null
// (the message is then kept as "unrecognized" for you to check).

import { parseAmountToPaise } from '../utils/money.js';

// Checked against the SMS sender name first (e.g. "JD-KOTAKB-S"), then the text.
const BANKS = [
  { name: 'Kotak Mahindra Bank', short: 'Kotak', patterns: [/kotak/i] },
  { name: 'Bank of India', short: 'BOI', patterns: [/\bBOIIND\b/i, /-BOI\b/, /\bbank of india\b/i] },
  { name: 'Bank of Baroda', short: 'BOB', patterns: [/\bBOB[A-Z]*\b/, /\bbank of baroda\b/i] },
  { name: 'State Bank of India', short: 'SBI', patterns: [/\bSBI[A-Z]*\b/, /\bstate bank\b/i] },
  { name: 'HDFC Bank', short: 'HDFC', patterns: [/hdfc/i] },
  { name: 'ICICI Bank', short: 'ICICI', patterns: [/icici/i] },
  { name: 'Axis Bank', short: 'Axis', patterns: [/\baxis\s*bank\b/i, /\bAXISBK\b/i] },
];

const AMOUNT = /(?:₹|\bRs\.?|\bINR)\s*([\d,]+(?:\.\d{1,2})?)/i;
const DEBIT_WORDS = /\b(debited|debit|sent|paid|spent|withdrawn|transferred|purchase)\b/i;
const CREDIT_WORDS = /\b(credited|received|deposited|refund(?:ed)?)\b/i;
// Messages about money that has not actually moved.
const NOT_A_TRANSACTION =
  /\b(failed|declined|unsuccessful|rejected|requested|request of|will be debited|is due|due on|payment due|reminder)\b/i;
const UPI_ID = /[\w.-]+@[a-z][a-z0-9]*/gi;
const ACCOUNT = /(?:\bAccount|\bAcct|A\/c|\bAC)\.?\s*(?:No\.?)?\s*(?:ending\s*(?:with)?\s*)?[Xx*.]*\s*(\d{3,6})\b/i;
const REFERENCE =
  /\b(?:UPI\s*Ref(?:erence)?|Ref(?:erence)?|RRN|UTR|Txn\s*ID)\s*(?:No\.?|Number|#)?\s*[:.-]?\s*([A-Za-z0-9]{6,22})/i;
// Where a name or UPI ID ends: before words like "on"/"via", a comma, or a full stop at the end of a sentence.
const NAME_END = String.raw`(?=\s+(?:on|via|ref|upi|at|for|from|if|avl|bal|info)\b|[,;(]|\.(?:\s|$)|$)`;
const PAID_TO = new RegExp(
  String.raw`\b(?:credited to|paid to|sent to|transferred to|to)\s+(?:VPA\s+)?(.+?)${NAME_END}`,
  'i',
);
const RECEIVED_FROM = new RegExp(String.raw`\b(?:from|by)\s+(?:VPA\s+)?(.+?)${NAME_END}`, 'i');
// UPI apps word incoming money as "NAME paid you ₹1.00" (Google Pay, PhonePe).
const PAID_YOU = /^(.+?)\s+(?:has\s+)?(?:paid|sent)\s+you\b/i;
// Words that start a reference or channel, not a person's name ("by UPI ref No...").
const NOT_A_NAME = /^(your|a\/c|ac\b|account|upi\b|ref\b|neft|imps|rtgs|transfer)/i;

export function findBank(title, text) {
  // UPI IDs like "shop@kotak" name the other person's bank, not yours, so ignore them.
  const textWithoutUpiIds = text.replace(UPI_ID, ' ');
  for (const source of [title, textWithoutUpiIds]) {
    const bank = BANKS.find((candidate) => candidate.patterns.some((pattern) => pattern.test(source)));
    if (bank) {
      return bank;
    }
  }
  return null;
}

function findDirection(text) {
  // Some messages mention both ("debited A/c ... and credited to NAME"): the first word wins.
  const debit = text.search(DEBIT_WORDS);
  const credit = text.search(CREDIT_WORDS);
  if (debit === -1 && credit === -1) {
    return null;
  }
  if (credit === -1) {
    return 'debit';
  }
  if (debit === -1) {
    return 'credit';
  }
  return debit < credit ? 'debit' : 'credit';
}

function cleanName(value) {
  const name = value?.trim().replace(/\s+/g, ' ');
  if (!name || NOT_A_NAME.test(name)) {
    return null;
  }
  return name.slice(0, 60);
}

/**
 * Returns { direction, amountPaise, bankName, bankShort, accountLast4,
 * counterparty, reference }, or null if this is not a completed payment.
 */
export function parsePaymentNotification({ title = '', text = '' }) {
  const heading = String(title ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  const message = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  // UPI apps often put the amount in the title ("NAME paid you ₹1.00"), so read both.
  const body = [heading, message].filter(Boolean).join(' ');
  if (!message || NOT_A_TRANSACTION.test(body)) {
    return null;
  }

  const amountMatch = body.match(AMOUNT);
  const amount = amountMatch ? parseAmountToPaise(amountMatch[1]) : null;
  const paidYou = body.match(PAID_YOU);
  const direction = paidYou ? 'credit' : findDirection(body);
  if (!amount?.paise || !direction) {
    return null;
  }

  const bank = findBank(heading, message);
  const accountDigits = message.match(ACCOUNT)?.[1];
  const reference = message.match(REFERENCE)?.[1];
  const nameMatch = paidYou ?? message.match(direction === 'debit' ? PAID_TO : RECEIVED_FROM);

  return {
    direction,
    amountPaise: amount.paise,
    bankName: bank?.name ?? null,
    bankShort: bank?.short ?? null,
    accountLast4: accountDigits ? accountDigits.slice(-4) : null,
    counterparty: cleanName(nameMatch?.[1]),
    reference: reference && /\d/.test(reference) ? reference : null,
  };
}
