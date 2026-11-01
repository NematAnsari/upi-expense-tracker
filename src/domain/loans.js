// Money lent and borrowed.
//
// A loan moves money, but it is not spending or income:
//   lent            you gave money to someone (they owe you)       money paid
//   lent_repaid     they paid you back (they owe you less)        money received
//   borrowed        someone gave you money (you owe them)         money received
//   borrowed_repaid you paid them back (you owe them less)        money paid
//
// Loan rows are kept out of spending and income totals and summed per person.
//
// On screen these are called "money given and taken" in plain words (the
// words loan, lend, borrow and owe are not shown to the user):
// choice: the wording on pickers ("I gave money").
// label: the short wording in lists ("Gave money").

import { formatDuration, formatOrdinalDate } from '../utils/dates.js';
import { formatINR } from '../utils/money.js';

export const LOANS_CATEGORY = 'Loans';

export const LOAN_TYPES = {
  lent: {
    direction: 'debit',
    choice: 'I gave money',
    label: 'Gave money',
    personLabel: 'Gave money to',
    addLabel: 'Add as money given',
    note: 'Not counted as spending. Shows under Money to receive.',
  },
  borrowed_repaid: {
    direction: 'debit',
    choice: 'Money returned',
    label: 'Money returned',
    personLabel: 'Returned to',
    addLabel: 'Add as money returned',
    note: 'Not counted as spending. Lowers your Money to return.',
  },
  borrowed: {
    direction: 'credit',
    choice: 'I took money',
    label: 'Took money',
    personLabel: 'Took money from',
    addLabel: 'Add as money taken',
    note: 'Not counted as income. Shows under Money to return.',
  },
  lent_repaid: {
    direction: 'credit',
    choice: 'Money received back',
    label: 'Money received back',
    personLabel: 'Received back from',
    addLabel: 'Add as money received back',
    note: 'Not counted as income. Lowers your Money to receive.',
  },
};

/** What a person's remaining amount means, in words (keys match describeBalance). */
export const BALANCE_TEXT = {
  owesYou: 'Money to receive',
  youOwe: 'Money to return',
  settled: 'Fully settled',
};

/** "What is this?" choices on a review card. `value: null` = a normal expense or income. */
export function loanChoicesFor(direction) {
  const normal = { value: null, label: direction === 'credit' ? 'Income' : 'Expense' };
  const loans = Object.entries(LOAN_TYPES)
    .filter(([, type]) => type.direction === direction)
    .map(([value, type]) => ({ value, label: type.choice }));
  return [normal, ...loans];
}

/** The repayment that settles a balance: they pay you back, or you pay them back. */
export function repaymentFor(status) {
  if (status === 'owesYou') {
    return 'lent_repaid';
  }
  if (status === 'youOwe') {
    return 'borrowed_repaid';
  }
  return null;
}

/**
 * The totals behind a person's remaining amount, as labeled lines. Only
 * non-zero parts are listed, so a person you only gave money to shows
 * "Total given" and "Received back". Direction sets the amount colour.
 */
export function balanceParts(person) {
  // label: on the person page. short: in the people list ("Gave ₹59,000 · Got back ₹2,000").
  return [
    { label: 'Total given', short: 'Gave', paise: person.givenPaise, direction: 'debit' },
    { label: 'Received back', short: 'Got back', paise: person.receivedBackPaise, direction: 'credit' },
    { label: 'Total taken', short: 'Took', paise: person.takenPaise, direction: 'credit' },
    { label: 'Returned', short: 'Returned', paise: person.returnedPaise, direction: 'debit' },
  ].filter((part) => part.paise > 0);
}

/**
 * Which list a person belongs to on the Given & Taken tab: 'given' (you gave
 * them money) and/or 'taken' (you took money from them). An open amount
 * decides it; a fully settled person is listed wherever they had entries.
 */
export function personLists(person) {
  if (person.status === 'owesYou') {
    return ['given'];
  }
  if (person.status === 'youOwe') {
    return ['taken'];
  }
  return [person.givenPaise > 0 ? 'given' : null, person.takenPaise > 0 ? 'taken' : null].filter(Boolean);
}

/**
 * The largest amount that can be recorded as money received back or returned,
 * given the person's net amount (see describeBalance). null when any amount is fine.
 */
export function maxReturnPaise(loanType, netPaise) {
  if (loanType === 'lent_repaid') {
    return Math.max(netPaise, 0);
  }
  if (loanType === 'borrowed_repaid') {
    return Math.max(-netPaise, 0);
  }
  return null;
}

export function isValidLoanType(loanType, direction) {
  return loanType == null || LOAN_TYPES[loanType]?.direction === direction;
}

// How a row starts, before the name: "Gave money to Amit", "Paid to XYZ Store".
const TITLE_PREFIX = {
  lent: 'Gave money to',
  borrowed: 'Took money from',
  lent_repaid: 'Money received back from',
  borrowed_repaid: 'Money returned to',
};

/**
 * The title of a transaction row, in plain words. With a name: "Paid to XYZ
 * Store", "Received from Rahul", "Gave money to Amit"... Without one, the
 * purpose, then the category (or the type, for money given and taken).
 */
export function activityTitle({ direction, loanType, merchant, purpose, categoryName }) {
  if (merchant) {
    const prefix = TITLE_PREFIX[loanType] ?? (direction === 'credit' ? 'Received from' : 'Paid to');
    return `${prefix} ${merchant}`;
  }
  return purpose || loanLabel(loanType) || categoryName;
}

/** Short label for lists ("Gave money", "Took money"...), or null for a normal transaction. */
export function loanLabel(loanType) {
  return LOAN_TYPES[loanType]?.label ?? null;
}

/**
 * Turns one person's loan total into what to show.
 * netPaise > 0: they owe you. netPaise < 0: you owe them. 0: settled.
 */
export function describeBalance(netPaise) {
  if (netPaise > 0) {
    return { status: 'owesYou', amountPaise: netPaise };
  }
  if (netPaise < 0) {
    return { status: 'youOwe', amountPaise: -netPaise };
  }
  return { status: 'settled', amountPaise: 0 };
}

// How each kind moves a person's net amount (above 0: they have money to return to you).
const NET_SIGN = { lent: 1, lent_repaid: -1, borrowed: -1, borrowed_repaid: 1 };

/** Oldest first, and by id when two entries share the same time. */
function byTime(a, b) {
  return a.occurredAt - b.occurredAt || a.id - b.id;
}

/**
 * The dates behind a person's remaining amount, from their entries
 * [{ id, loanType, amountPaise, occurredAt }] in any order:
 *   openSinceAt:  when the current open amount started (the entry that last
 *                 moved the net amount away from zero). null when settled.
 *   settledAt:    when it last came back to zero. null while open.
 *   settledFromAt: when that settled amount had started, to count the days it took.
 */
export function settlementDates(entries) {
  let net = 0;
  let startedAt = null;
  let settledAt = null;
  let settledFromAt = null;
  for (const entry of [...entries].sort(byTime)) {
    const before = net;
    net += NET_SIGN[entry.loanType] * entry.amountPaise;
    if (net === 0) {
      settledAt = entry.occurredAt;
      settledFromAt = startedAt ?? entry.occurredAt;
      startedAt = null;
    } else if (before === 0 || Math.sign(before) !== Math.sign(net)) {
      startedAt = entry.occurredAt;
    }
  }
  return net === 0
    ? { openSinceAt: null, settledAt, settledFromAt }
    : { openSinceAt: startedAt, settledAt: null, settledFromAt: null };
}

/**
 * The date and total time for a person, shown apart: the date in the details,
 * the time under the status icon (which says what both mean):
 *   pending: { status: 'pending', date: '12th Aug 2026', duration: '2 months' }  (started on, open for)
 *   settled: { status: 'settled', date: '20th Sep 2026', duration: '1 month' }   (settled on, took)
 * spoken: the same in words, for screen readers. null when the dates are not known.
 */
export function timelineText(person, now = Date.now()) {
  if (person.openSinceAt) {
    const date = formatOrdinalDate(person.openSinceAt);
    const duration = formatDuration(person.openSinceAt, now);
    return { status: 'pending', date, duration, spoken: `Pending since ${date}, ${duration}` };
  }
  if (person.settledAt) {
    const date = formatOrdinalDate(person.settledAt);
    const duration = formatDuration(person.settledFromAt ?? person.settledAt, person.settledAt);
    return { status: 'settled', date, duration, spoken: `Settled on ${date}, took ${duration}` };
  }
  return null;
}

/** When the current open amount started, or null when settled (see settlementDates). */
export function openSince(entries) {
  return settlementDates(entries).openSinceAt;
}

/** The person's net amount after each entry, as { [entry id]: netPaise }. */
export function runningRemaining(entries) {
  const after = {};
  let net = 0;
  for (const entry of [...entries].sort(byTime)) {
    net += NET_SIGN[entry.loanType] * entry.amountPaise;
    after[entry.id] = net;
  }
  return after;
}

/** "₹57,000.00 left to receive", "₹6,000.00 left to return" or "Fully settled". */
export function describeNet(netPaise) {
  if (netPaise > 0) {
    return `${formatINR(netPaise)} left to receive`;
  }
  if (netPaise < 0) {
    return `${formatINR(-netPaise)} left to return`;
  }
  return 'Fully settled';
}

export const PEOPLE_SORTS = [
  { value: 'all', label: 'All' },
  { value: 'latest', label: 'Latest' },
  { value: 'largest', label: 'Largest Amount' },
  { value: 'oldest', label: 'Oldest Pending' },
];

/**
 * Orders the people list. Fully settled people always come last.
 * all (the default) and latest: most recent activity first.
 * largest: biggest remaining amount first.
 * oldest: the open amount that started longest ago first.
 */
export function sortPeople(people, mode = 'all') {
  const settledLast = (a, b) => (a.status === 'settled') - (b.status === 'settled');
  const latest = (a, b) => b.lastAt - a.lastAt;
  const compare = {
    all: latest,
    latest,
    largest: (a, b) => b.amountPaise - a.amountPaise || b.lastAt - a.lastAt,
    oldest: (a, b) => (a.openSinceAt ?? Infinity) - (b.openSinceAt ?? Infinity) || b.lastAt - a.lastAt,
  }[mode];
  return [...people].sort((a, b) => settledLast(a, b) || compare(a, b));
}

/** Lower case, single spaces, no spaces at the ends. */
function normalizeName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** True when two names differ by at most one letter added, removed or changed. */
function isOneEditApart(a, b) {
  if (Math.abs(a.length - b.length) > 1) {
    return false;
  }
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) {
      return false;
    }
    if (a.length > b.length) {
      i += 1;
    } else if (b.length > a.length) {
      j += 1;
    } else {
      i += 1;
      j += 1;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/**
 * Existing people whose name looks like `name` but is not the same, so the
 * form can ask "Same person as Rahul Kumar?". Similar means: one name's words
 * are all in the other ("Rahul" / "Rahul Kumar"), the same first name with a
 * different rest, or a one-letter typo in a name of 4+ letters ("Rahual").
 * Returns up to `limit` names as they are spelled in the list.
 */
export function findSimilarPeople(name, knownNames, limit = 2) {
  const typed = normalizeName(name ?? '');
  if (typed.length < 3) {
    return [];
  }
  const typedWords = typed.split(' ');
  if (knownNames.some((known) => normalizeName(known) === typed)) {
    return [];
  }
  return knownNames
    .filter((known) => {
      const other = normalizeName(known);
      const otherWords = other.split(' ');
      const contains = (words, inWords) => words.every((word) => inWords.includes(word));
      return (
        contains(typedWords, otherWords) ||
        contains(otherWords, typedWords) ||
        (typedWords[0].length >= 3 && typedWords[0] === otherWords[0]) ||
        (typed.length >= 4 && isOneEditApart(typed, other))
      );
    })
    .slice(0, limit);
}

/**
 * For a detected bank payment from or to someone with an open amount, the
 * likely type: money in from a person with money to receive is probably
 * "Money received back"; money out to a person you have money to return to is
 * probably "Money returned". Only suggested when the name matches exactly
 * (ignoring case and spaces) and the amount fits the remaining amount.
 * Returns { loanType, person } or null.
 */
export function suggestLoanType(detected, people) {
  if (!detected.counterparty || !detected.amountPaise) {
    return null;
  }
  const key = normalizeName(detected.counterparty);
  const person = people.find((candidate) => normalizeName(candidate.person) === key);
  if (!person) {
    return null;
  }
  const loanType =
    detected.direction === 'credit' && person.status === 'owesYou'
      ? 'lent_repaid'
      : detected.direction === 'debit' && person.status === 'youOwe'
        ? 'borrowed_repaid'
        : null;
  if (!loanType || detected.amountPaise > person.amountPaise) {
    return null;
  }
  return { loanType, person };
}

/**
 * A friendly reminder to share with someone who has money to return to you.
 * Only for people with money to receive; null otherwise.
 */
export function reminderMessage(person) {
  if (person.status !== 'owesYou') {
    return null;
  }
  return `Hi ${person.person}, just a friendly reminder: ${formatINR(person.amountPaise)} is still remaining from the money I gave you. Thank you!`;
}
