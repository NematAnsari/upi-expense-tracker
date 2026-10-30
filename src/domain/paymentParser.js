// Reads a bank or UPI payment notification and pulls out what it can.
// Banks word their messages differently and change them over time, so this
// is best-effort: any field may be missing, and unknown formats return null
// (the message is then kept as "unrecognized" for you to check).

import { parseAmountToPaise } from '../utils/money.js';
import { findBank } from './banks.js';

const AMOUNT = /(?:₹|\bRs\.?|\bINR)\s*([\d,]+(?:\.\d{1,2})?)/i;
// Some banks write no currency: "A/C X1234 debited by 20.0", "Dr. 500.00".
const AMOUNT_AFTER_MONEY_WORD =
  /\b(?:debited|credited|deducted|withdrawn|paid|sent|received|spent|transferred|dr|cr)\.?\s+(?:by|for|of|with)?\s*([\d,]+(?:\.\d{1,2})?)\b/i;
// "Dr" / "Cr" are short for debit / credit (used by Bank of Baroda and others).
const DEBIT_WORDS = /\b(debited|debit|dr|deducted|sent|paid|spent|withdrawn|transferred|trf|purchase)\b/i;
const CREDIT_WORDS = /\b(credited|cr|received|deposited|refund(?:ed)?)\b/i;
// Messages about money that has not actually moved.
const NOT_A_TRANSACTION =
  /\b(failed|declined|unsuccessful|rejected|requested|request of|will be debited|is due|due on|payment due|reminder)\b/i;
const ACCOUNT = /(?:\bAccount|\bAcct|A\/c|\bAC)\.?\s*(?:No\.?)?\s*(?:ending\s*(?:with)?\s*)?[Xx*.]*\s*(\d{3,6})\b/i;
const REFERENCE =
  /\b(?:UPI\s*Ref(?:erence)?|Ref(?:erence)?|RRN|UTR|Txn\s*ID)\s*(?:No\.?|Number|#)?\s*[:.-]?\s*([A-Za-z0-9]{6,22})/i;
// "thru UPI/612345678901" (Bank of Baroda and others).
const UPI_SLASH_REFERENCE = /\bUPI\/(\d{9,16})\b/i;
// Where a name or UPI ID ends: before words like "on"/"via", a comma, or a full stop at the end of a sentence.
const NAME_END = String.raw`(?=\s+(?:on|via|ref|refno|upi|at|for|from|if|avl|avlbal|bal|info|txn|utr|rrn|not)\b|[,;(]|\.(?:\s|$)|$)`;
// Global (g) so every candidate can be tried until one is a real name.
const PAID_TO = new RegExp(
  String.raw`\b(?:credited to|paid to|sent to|transferred to|to)\s+(?:VPA\s+)?(.+?)${NAME_END}`,
  'gi',
);
const RECEIVED_FROM = new RegExp(String.raw`\b(?:from|by)\s+(?:VPA\s+)?(.+?)${NAME_END}`, 'gi');
// UPI apps word incoming money as "NAME paid you ₹1.00" (Google Pay, PhonePe).
const PAID_YOU = /^(.+?)\s+(?:has\s+)?(?:paid|sent)\s+you\b/i;
// Things that follow "to"/"from"/"by" but are not a name: your own account,
// a reference or channel ("by UPI ref No..."), or an amount ("credited by Rs.500").
const NOT_A_NAME = /^(your|a\/c|ac\b|account|upi\b|ref\b|neft|imps|rtgs|transfer|rs\b|rs\.|inr\b|₹|\d)/i;

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

/** The first match of a global pattern that is a real name, or null. */
function findName(pattern, text) {
  for (const match of text.matchAll(pattern)) {
    const name = cleanName(match[1]);
    if (name) {
      return name;
    }
  }
  return null;
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

  const amountMatch = body.match(AMOUNT) ?? body.match(AMOUNT_AFTER_MONEY_WORD);
  const amount = amountMatch ? parseAmountToPaise(amountMatch[1]) : null;
  const paidYou = body.match(PAID_YOU);
  const direction = paidYou ? 'credit' : findDirection(body);
  if (!amount?.paise || !direction) {
    return null;
  }

  const bank = findBank(heading, message);
  const accountDigits = message.match(ACCOUNT)?.[1];
  const reference = message.match(REFERENCE)?.[1] ?? message.match(UPI_SLASH_REFERENCE)?.[1];
  const counterparty = paidYou
    ? cleanName(paidYou[1])
    : findName(direction === 'debit' ? PAID_TO : RECEIVED_FROM, message);

  return {
    direction,
    amountPaise: amount.paise,
    bankName: bank?.name ?? null,
    bankShort: bank?.short ?? null,
    accountLast4: accountDigits ? accountDigits.slice(-4) : null,
    counterparty,
    reference: reference && /\d/.test(reference) ? reference : null,
  };
}
