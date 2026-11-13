// Money given and taken, per person: balances, the checks that keep money
// back from exceeding what is open, and renaming. People are matched by name
// without case and outer spaces (see SAME_PERSON), the same way everywhere.

import {
  balanceStatus,
  currentDueAt,
  findReturnProblem,
  maxReturnPaise,
  netChange,
  settlementDates,
  sortPeople,
} from '../domain/people.js';
import { getDayRange } from '../utils/dates.js';
import { formatINR } from '../utils/money.js';
import { cleanName } from '../utils/text.js';
import { placeholders, SAME_PERSON } from './sql.js';

// How each type moves the net amount: above 0 they have money to return to you.
const NET_PAISE_SQL = `SUM(CASE t.loan_type
       WHEN 'lent' THEN t.amount_paise
       WHEN 'lent_repaid' THEN -t.amount_paise
       WHEN 'borrowed' THEN -t.amount_paise
       WHEN 'borrowed_repaid' THEN t.amount_paise
     END)`;

// Entries that belong to a named person.
const HAS_PERSON = "t.loan_type IS NOT NULL AND t.merchant IS NOT NULL AND trim(t.merchant) <> ''";

/** One person's net amount, leaving out the entry being edited (excludeId). */
async function getPersonNetPaise(db, person, excludeId = null) {
  const row = await db.getFirstAsync(
    `SELECT COALESCE(${NET_PAISE_SQL}, 0) AS netPaise FROM transactions t WHERE ${SAME_PERSON} AND t.id IS NOT ?`,
    [person, excludeId],
  );
  return row?.netPaise ?? 0;
}

/**
 * Money received back or returned cannot be more than what is open with the
 * person. Returns a message for the amount field, or null when it is fine.
 * excludeId: the entry being edited, so its old amount is not counted twice.
 */
export async function checkReturnAmount(db, values, excludeId = null) {
  if (values.loanType !== 'lent_repaid' && values.loanType !== 'borrowed_repaid') {
    return null;
  }
  const maxPaise = maxReturnPaise(values.loanType, await getPersonNetPaise(db, values.merchant, excludeId));
  if (values.amountPaise <= maxPaise) {
    return null;
  }
  if (maxPaise === 0) {
    return values.loanType === 'lent_repaid'
      ? `${values.merchant} has no money to return to you.`
      : `You have no money to return to ${values.merchant}.`;
  }
  return `Remaining amount is ${formatINR(maxPaise)}. Enter ${formatINR(maxPaise)} or less.`;
}

/**
 * Refuses a delete or edit that would make money back larger than what was
 * open at that time (it would put the person on the wrong side). Example:
 * Amit gave back all ₹1,000, so the ₹1,000 you gave cannot drop to ₹500.
 * removeIds: entries about to be deleted. edit: { id, values } about to change.
 * A person already inconsistent before can still be changed, so old data is
 * never locked. Returns a message, or null when it is fine.
 */
export async function checkPeopleChange(db, { removeIds = [], edit = null }) {
  const ids = [...removeIds, ...(edit ? [edit.id] : [])];
  const keys = new Set();
  if (ids.length > 0) {
    const rows = await db.getAllAsync(
      `SELECT DISTINCT lower(trim(t.merchant)) AS key FROM transactions t
       WHERE ${HAS_PERSON} AND t.id IN (${placeholders(ids.length)})`,
      ids,
    );
    rows.forEach((row) => keys.add(row.key));
  }
  // Asked from SQLite so the name is matched exactly as the queries match it.
  let newKey = null;
  if (edit?.values?.loanType && edit.values.merchant) {
    newKey = (await db.getFirstAsync('SELECT lower(trim(?)) AS key', [edit.values.merchant])).key;
    keys.add(newKey);
  }

  for (const key of keys) {
    const entries = await db.getAllAsync(
      `SELECT t.id, t.merchant, t.loan_type AS loanType, t.amount_paise AS amountPaise, t.occurred_at AS occurredAt
       FROM transactions t WHERE ${SAME_PERSON}`,
      [key],
    );
    const after = entries.filter((entry) => !removeIds.includes(entry.id) && entry.id !== edit?.id);
    if (key === newKey) {
      const { loanType, amountPaise, occurredAt } = edit.values;
      after.push({ id: edit.id, loanType, amountPaise, occurredAt });
    }
    const problem = findReturnProblem(after);
    if (!problem || findReturnProblem(entries)) {
      continue;
    }
    const name = (key === newKey ? edit.values.merchant : entries[0]?.merchant)?.trim() ?? 'this person';
    return problem.entry.loanType === 'lent_repaid'
      ? `Money received back from ${name} would be more than they had to return to you. Change or delete the money received back first.`
      : `Money returned to ${name} would be more than you had to return to them. Change or delete the money returned first.`;
  }
  return null;
}

/** Adds one entry to a person's running totals. */
function addToPerson(person, entry) {
  person.netPaise += netChange(entry);
  person.givenPaise += entry.loanType === 'lent' ? entry.amountPaise : 0;
  person.receivedBackPaise += entry.loanType === 'lent_repaid' ? entry.amountPaise : 0;
  person.takenPaise += entry.loanType === 'borrowed' ? entry.amountPaise : 0;
  person.returnedPaise += entry.loanType === 'borrowed_repaid' ? entry.amountPaise : 0;
  person.count += 1;
  // The name is spelled as in the newest entry.
  if (entry.occurredAt > person.lastAt || (entry.occurredAt === person.lastAt && entry.id > person.lastId)) {
    person.lastAt = entry.occurredAt;
    person.lastId = entry.id;
    person.person = entry.merchant.trim();
  }
  person.entries.push(entry);
}

/**
 * Every person's balance, all time. Settled people come last.
 * Returns { people, toReceivePaise, toReturnPaise, givenTodayPaise, takenTodayPaise }.
 * Each person: { person, netPaise, status, amountPaise, lastAt, count, givenPaise,
 * receivedBackPaise, takenPaise, returnedPaise, openSinceAt, settledAt,
 * settledFromAt, dueAt }. "Today" is by `now`.
 */
export async function getPeopleBalances(db, now = new Date()) {
  // `key` comes from SQLite so people are grouped exactly as the other queries match them.
  const entries = await db.getAllAsync(
    `SELECT t.id, lower(trim(t.merchant)) AS key, t.merchant, t.loan_type AS loanType,
            t.amount_paise AS amountPaise, t.occurred_at AS occurredAt, t.due_at AS dueAt
     FROM transactions t WHERE ${HAS_PERSON}`,
  );
  const byKey = new Map();
  for (const entry of entries) {
    if (!byKey.has(entry.key)) {
      byKey.set(entry.key, {
        person: '',
        netPaise: 0,
        givenPaise: 0,
        receivedBackPaise: 0,
        takenPaise: 0,
        returnedPaise: 0,
        count: 0,
        lastAt: -Infinity,
        lastId: -Infinity,
        entries: [],
      });
    }
    addToPerson(byKey.get(entry.key), entry);
  }

  const people = sortPeople(
    [...byKey.values()].map(({ entries: own, lastId, ...person }) => {
      const dates = settlementDates(own);
      return { ...person, ...balanceStatus(person.netPaise), ...dates, dueAt: currentDueAt(own, dates.openSinceAt) };
    }),
  );

  const today = getDayRange(now);
  const todayTotal = (loanType) =>
    entries
      .filter((e) => e.loanType === loanType && e.occurredAt >= today.startMs && e.occurredAt < today.endMs)
      .reduce((sum, e) => sum + e.amountPaise, 0);
  const totalFor = (status) => people.filter((p) => p.status === status).reduce((sum, p) => sum + p.amountPaise, 0);

  return {
    people,
    toReceivePaise: totalFor('toReceive'),
    toReturnPaise: totalFor('toReturn'),
    givenTodayPaise: todayTotal('lent'),
    takenTodayPaise: todayTotal('borrowed'),
  };
}

/**
 * Everyone's name, spelled as in their newest entry, in getPeopleBalances order
 * (newest first, settled last). A light query for the form's "Same person as...?".
 */
export async function listPeopleNames(db) {
  const rows = await db.getAllAsync(
    `SELECT t.merchant AS name, MAX(t.occurred_at) AS lastAt, ${NET_PAISE_SQL} AS netPaise
     FROM transactions t WHERE ${HAS_PERSON}
     GROUP BY lower(trim(t.merchant))
     ORDER BY (netPaise = 0) ASC, lastAt DESC`,
  );
  return rows.map((row) => row.name.trim());
}

/**
 * Renames a person on all their money given and taken entries. A name that is
 * already someone else's joins the two. Expenses and income with the same name
 * are left alone. Remembered bank names follow. Returns how many entries changed.
 */
export async function renamePerson(db, oldName, newName) {
  const name = cleanName(newName);
  if (!name) {
    throw new Error('Enter a name.');
  }
  const result = await db.runAsync(
    `UPDATE transactions SET merchant = ?, updated_at = ?
     WHERE loan_type IS NOT NULL AND lower(trim(merchant)) = lower(trim(?))`,
    [name, Date.now(), oldName],
  );
  await db.runAsync(
    'UPDATE name_memory SET merchant = ?, updated_at = ? WHERE lower(trim(merchant)) = lower(trim(?))',
    [name, Date.now(), oldName],
  );
  return result.changes;
}
