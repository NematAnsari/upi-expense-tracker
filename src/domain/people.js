// People you gave money to or took money from (the Given & Taken tab).
// A person's net amount: above 0 they have money to return to you, below 0
// you have money to return to them, 0 is fully settled. See entryTypes.js for
// the kinds of entry.

import { daysBetween, formatDuration, formatOrdinalDate, formatShortDate } from '../utils/dates.js';
import { formatINR } from '../utils/money.js';
import { plural } from '../utils/text.js';
import { takesDueDate } from './entryTypes.js';

/** A remaining amount in words. Keys are the statuses from balanceStatus. */
export const BALANCE_TEXT = {
  toReceive: 'Money to receive',
  toReturn: 'Money to return',
  settled: 'Fully settled',
};

/** The short line under an open amount. */
export const LEFT_TEXT = {
  toReceive: 'left to receive',
  toReturn: 'left to return',
};

// How each type moves a person's net amount.
const NET_SIGN = { lent: 1, lent_repaid: -1, borrowed: -1, borrowed_repaid: 1 };

/** How much one entry moves its person's net amount: +₹500 for I gave ₹500. */
export function netChange(entry) {
  return NET_SIGN[entry.loanType] * entry.amountPaise;
}

/** Oldest first; by id when two entries share a time. */
function oldestFirst(a, b) {
  return a.occurredAt - b.occurredAt || a.id - b.id;
}

/** { status: 'toReceive' | 'toReturn' | 'settled', amountPaise } from a net amount. */
export function balanceStatus(netPaise) {
  if (netPaise > 0) {
    return { status: 'toReceive', amountPaise: netPaise };
  }
  if (netPaise < 0) {
    return { status: 'toReturn', amountPaise: -netPaise };
  }
  return { status: 'settled', amountPaise: 0 };
}

/** The type that brings a status back to zero: money received back, or money returned. */
export function returnTypeFor(status) {
  if (status === 'toReceive') {
    return 'lent_repaid';
  }
  if (status === 'toReturn') {
    return 'borrowed_repaid';
  }
  return null;
}

/** The most that can come back as this return type, given the net amount. null for other types. */
export function maxReturnPaise(loanType, netPaise) {
  if (loanType === 'lent_repaid') {
    return Math.max(netPaise, 0);
  }
  if (loanType === 'borrowed_repaid') {
    return Math.max(-netPaise, 0);
  }
  return null;
}

/**
 * Goes through a person's entries in time order and finds the first money
 * back that was more than was open at that moment (it would put the person on
 * the wrong side). Returns { entry, availablePaise }, or null when all is fine.
 * entries: [{ id, loanType, amountPaise, occurredAt }].
 */
export function findReturnProblem(entries) {
  let net = 0;
  for (const entry of [...entries].sort(oldestFirst)) {
    const availablePaise = maxReturnPaise(entry.loanType, net);
    if (availablePaise !== null && entry.amountPaise > availablePaise) {
      return { entry, availablePaise };
    }
    net += netChange(entry);
  }
  return null;
}

/** The net amount after each entry: { [entry id]: netPaise }. */
export function remainingAfterEach(entries) {
  const after = {};
  let net = 0;
  for (const entry of [...entries].sort(oldestFirst)) {
    net += netChange(entry);
    after[entry.id] = net;
  }
  return after;
}

/**
 * When the open amount started (openSinceAt), or when it was last settled
 * (settledAt) and since when that amount had been open (settledFromAt).
 * entries: [{ id, loanType, amountPaise, occurredAt }], any order.
 */
export function settlementDates(entries) {
  let net = 0;
  let startedAt = null;
  let settledAt = null;
  let settledFromAt = null;
  for (const entry of [...entries].sort(oldestFirst)) {
    const before = net;
    net += netChange(entry);
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
 * The date and the time taken, shown under the status icon:
 * pending { date: started on, duration: open for }, settled { date: settled on, duration: took }.
 * spoken: the same for screen readers. null when the dates are not known.
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

/**
 * The "return by" date that counts now: the latest one set since the open
 * amount started. A date from an earlier, settled round no longer counts.
 * entries: [{ loanType, occurredAt, dueAt }].
 */
export function currentDueAt(entries, openSinceAt) {
  if (openSinceAt == null) {
    return null;
  }
  const dates = entries
    .filter((entry) => takesDueDate(entry.loanType) && entry.occurredAt >= openSinceAt && entry.dueAt != null)
    .map((entry) => entry.dueAt);
  return dates.length > 0 ? Math.max(...dates) : null;
}

/** "Return by 15 Nov" or, once late, "Overdue by 3 days". null with no date or nothing left. */
export function dueText(person, now = Date.now()) {
  if (!person.dueAt || person.status === 'settled') {
    return null;
  }
  if (now <= person.dueAt) {
    return { overdue: false, text: `Return by ${formatShortDate(person.dueAt, new Date(now))}` };
  }
  const days = Math.max(daysBetween(person.dueAt, now), 1);
  return { overdue: true, text: `Overdue by ${plural(days, 'day', 'days')}` };
}

/** "₹57,000.00 left to receive", "₹6,000.00 left to return" or "Fully settled". */
export function remainingText(netPaise) {
  const { status, amountPaise } = balanceStatus(netPaise);
  return status === 'settled' ? BALANCE_TEXT.settled : `${formatINR(amountPaise)} ${LEFT_TEXT[status]}`;
}

/** What was left after an entry, for one line: "₹50,000.00 left" or "Settled". */
export function leftText(netPaise) {
  return netPaise === 0 ? 'Settled' : `${formatINR(Math.abs(netPaise))} left`;
}

/**
 * The person page's totals and Summary. The side shown is the open amount's
 * side; for a settled person, the bigger one.
 * pair: two totals side by side ("Total given | Received back" or "Total taken | Returned").
 * share: how much came back, 0 to 1. firstAt, lastBackAt: dates. count: entries.
 */
export function personSummary(balance, entries) {
  const gave =
    balance.status === 'toReceive' || (balance.status !== 'toReturn' && balance.givenPaise >= balance.takenPaise);
  const pair = gave
    ? [
        { label: 'Total given', paise: balance.givenPaise, direction: 'debit' },
        { label: 'Received back', paise: balance.receivedBackPaise, direction: 'credit' },
      ]
    : [
        { label: 'Total taken', paise: balance.takenPaise, direction: 'credit' },
        { label: 'Returned', paise: balance.returnedPaise, direction: 'debit' },
      ];
  const total = pair[0].paise;
  const back = pair[1].paise;
  const backType = gave ? 'lent_repaid' : 'borrowed_repaid';
  const times = entries.map((entry) => entry.occurredAt);
  const backTimes = entries.filter((entry) => entry.loanType === backType).map((entry) => entry.occurredAt);
  return {
    pair,
    share: total > 0 ? Math.min(back / total, 1) : 0,
    back,
    total,
    firstAt: times.length > 0 ? Math.min(...times) : null,
    lastBackAt: backTimes.length > 0 ? Math.max(...backTimes) : null,
    count: entries.length,
  };
}

/** The non-zero totals as lines. label: on the person page. short: in the list ("Gave ₹59,000"). */
export function balanceParts(person) {
  return [
    { label: 'Total given', short: 'Gave', paise: person.givenPaise, direction: 'debit' },
    { label: 'Received back', short: 'Got back', paise: person.receivedBackPaise, direction: 'credit' },
    { label: 'Total taken', short: 'Took', paise: person.takenPaise, direction: 'credit' },
    { label: 'Returned', short: 'Returned', paise: person.returnedPaise, direction: 'debit' },
  ].filter((part) => part.paise > 0);
}

/**
 * Which tab a person shows under: 'given', 'taken' or both. An open amount
 * decides it; a settled person shows wherever they had entries.
 */
export function personLists(person) {
  if (person.status === 'toReceive') {
    return ['given'];
  }
  if (person.status === 'toReturn') {
    return ['taken'];
  }
  return [person.givenPaise > 0 ? 'given' : null, person.takenPaise > 0 ? 'taken' : null].filter(Boolean);
}

// Choices in the Given & Taken Filters sheet.
export const PEOPLE_SHOW = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'settled', label: 'Settled' },
];

export const PEOPLE_SORTS = [
  { value: 'latest', label: 'Latest' },
  { value: 'largest', label: 'Largest' },
  { value: 'oldest', label: 'Oldest pending' },
];

/** Everyone ('all'), people with money left ('pending'), or settled people ('settled'). */
export function filterPeople(people, show = 'all') {
  if (show === 'all') {
    return people;
  }
  return people.filter((person) => (person.status === 'settled') === (show === 'settled'));
}

/**
 * Orders people; settled people always come last. latest: newest activity
 * first. largest: biggest amount first. oldest: longest open first.
 */
export function sortPeople(people, mode = 'latest') {
  const settledLast = (a, b) => (a.status === 'settled') - (b.status === 'settled');
  const compare = {
    latest: (a, b) => b.lastAt - a.lastAt,
    largest: (a, b) => b.amountPaise - a.amountPaise || b.lastAt - a.lastAt,
    oldest: (a, b) => (a.openSinceAt ?? Infinity) - (b.openSinceAt ?? Infinity) || b.lastAt - a.lastAt,
  }[mode];
  return [...people].sort((a, b) => settledLast(a, b) || compare(a, b));
}

/** How names are compared: lower case, one space between words. "Rahul  KUMAR" -> "rahul kumar". */
export function personKey(name) {
  return String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
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
 * Known names that look like `name` but are not the same, for "Same person
 * as Rahul Kumar?". Similar: all words of one are in the other, the same first
 * name, or a one-letter typo in a name of 4+ letters. Up to `limit` names.
 */
export function findSimilarPeople(name, knownNames, limit = 2) {
  const typed = personKey(name);
  if (typed.length < 3) {
    return [];
  }
  const typedWords = typed.split(' ');
  if (knownNames.some((known) => personKey(known) === typed)) {
    return [];
  }
  const containsAll = (words, inWords) => words.every((word) => inWords.includes(word));
  return knownNames
    .filter((known) => {
      const other = personKey(known);
      const otherWords = other.split(' ');
      return (
        containsAll(typedWords, otherWords) ||
        containsAll(otherWords, typedWords) ||
        (typedWords[0].length >= 3 && typedWords[0] === otherWords[0]) ||
        (typed.length >= 4 && isOneEditApart(typed, other))
      );
    })
    .slice(0, limit);
}

/**
 * For a bank payment from or to someone with money open, the likely type:
 * money in from a person with money to receive is probably money received
 * back, and the other way round. Only when the name matches and the amount
 * fits. Returns { loanType, person } or null.
 */
export function suggestReturnType(detected, people) {
  if (!detected.counterparty || !detected.amountPaise) {
    return null;
  }
  const key = personKey(detected.counterparty);
  const person = people.find((candidate) => personKey(candidate.person) === key);
  if (!person) {
    return null;
  }
  let loanType = null;
  if (detected.direction === 'credit' && person.status === 'toReceive') {
    loanType = 'lent_repaid';
  } else if (detected.direction === 'debit' && person.status === 'toReturn') {
    loanType = 'borrowed_repaid';
  }
  if (!loanType || detected.amountPaise > person.amountPaise) {
    return null;
  }
  return { loanType, person };
}

/** A friendly reminder message for someone with money to return to you; null otherwise. */
export function reminderMessage(person) {
  if (person.status !== 'toReceive') {
    return null;
  }
  return `Hi ${person.person}, just a friendly reminder: ${formatINR(person.amountPaise)} is still remaining from the money I gave you. Thank you!`;
}
