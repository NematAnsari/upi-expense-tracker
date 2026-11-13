// Reading captured bank messages into the database: saving each one, deciding
// what it is (payment, duplicate, not a payment), and finding possible repeats.
// Nothing here adds an expense; that happens on Review (see detected.js).

import { parsePaymentNotification, PARSER_VERSION } from '../domain/paymentParser.js';
import { findOrCreateAccount } from './accounts.js';

// The same amount, direction and account within this time may be one payment
// reported twice. It is only flagged, never merged.
const DUPLICATE_WINDOW_MS = 15 * 60 * 1000;

// Apps that only copy a bank SMS you already get, so every payment would show twice.
const SMS_COPY_APPS = ['com.truecaller'];

// Remembers which reader version last read the unreadable messages.
const PARSER_VERSION_KEY = 'parser_version';

// The rows being checked against: the current item (selfId, null when new)
// and the transaction already made from it are left out.
const NOT_FROM_SELF =
  'NOT IN (SELECT transaction_id FROM detected_payments WHERE id = ? AND transaction_id IS NOT NULL)';

/**
 * True when a payment with this UPI reference and amount is already saved or
 * waiting. Only earlier rows count, so the first of a pair stays normal.
 */
async function isReferenceAlreadySaved(db, reference, amountPaise, selfId) {
  const saved = await db.getFirstAsync(
    `SELECT t.id FROM transactions t
     WHERE t.reference = ? AND t.amount_paise = ? AND t.id ${NOT_FROM_SELF}
     LIMIT 1`,
    [reference, amountPaise, selfId ?? -1],
  );
  if (saved) {
    return true;
  }
  // A split is saved as its shares, so compare with each split's total too.
  const split = await db.getFirstAsync(
    `SELECT t.split_group FROM transactions t
     WHERE t.split_group IS NOT NULL AND t.reference = ? AND t.split_group ${NOT_FROM_SELF}
     GROUP BY t.split_group HAVING SUM(t.amount_paise) = ?
     LIMIT 1`,
    [reference, selfId ?? -1, amountPaise],
  );
  if (split) {
    return true;
  }
  const detected = await db.getFirstAsync(
    `SELECT id FROM detected_payments
     WHERE reference = ? AND amount_paise = ? AND id <> ?
       AND (status = 'added' OR (status = 'pending' AND id < ?)) LIMIT 1`,
    [reference, amountPaise, selfId ?? -1, selfId ?? Number.MAX_SAFE_INTEGER],
  );
  return Boolean(detected);
}

/**
 * An earlier payment this one may repeat, or null:
 * { kind: 'detected' | 'saved', direction, amountPaise, at, accountName, sourcePackage, status }.
 * Two different UPI references are always two payments, so a match needs at
 * least one side without a reference. An unknown account on either side still
 * matches, because UPI app notifications often have none.
 */
export async function findPossibleOriginal(db, { direction, amountPaise, reference }, accountId, postedAt, selfId) {
  const from = postedAt - DUPLICATE_WINDOW_MS;
  const to = postedAt + DUPLICATE_WINDOW_MS;
  const ref = reference ?? null;
  const detected = await db.getFirstAsync(
    `SELECT 'detected' AS kind, d.direction, d.amount_paise AS amountPaise, d.posted_at AS at,
            a.nickname AS accountName, d.source_package AS sourcePackage, d.status
     FROM detected_payments d
     LEFT JOIN accounts a ON a.id = d.account_id
     WHERE d.direction = ? AND d.amount_paise = ? AND d.posted_at BETWEEN ? AND ?
       AND (d.account_id IS NULL OR ? IS NULL OR d.account_id = ?)
       AND (d.reference IS NULL OR ? IS NULL)
       AND d.status IN ('pending', 'added') AND d.id <> ?
       AND (d.posted_at < ? OR (d.posted_at = ? AND d.id < ?))
     ORDER BY d.posted_at
     LIMIT 1`,
    [
      direction,
      amountPaise,
      from,
      to,
      accountId,
      accountId,
      ref,
      selfId ?? -1,
      postedAt,
      postedAt,
      selfId ?? Number.MAX_SAFE_INTEGER,
    ],
  );
  if (detected) {
    return detected;
  }
  const saved = await db.getFirstAsync(
    `SELECT 'saved' AS kind, t.direction, t.amount_paise AS amountPaise, t.occurred_at AS at,
            a.nickname AS accountName, NULL AS sourcePackage, 'added' AS status
     FROM transactions t
     LEFT JOIN accounts a ON a.id = t.account_id
     WHERE t.direction = ? AND t.amount_paise = ? AND t.occurred_at BETWEEN ? AND ?
       AND (t.reference IS NULL OR ? IS NULL) AND t.id ${NOT_FROM_SELF}
     LIMIT 1`,
    [direction, amountPaise, from, to, ref, selfId ?? -1],
  );
  if (saved) {
    return saved;
  }
  // A split is saved as its shares (₹125 + ₹125) but the bank reports ₹250.
  return db.getFirstAsync(
    `SELECT 'saved' AS kind, t.direction, SUM(t.amount_paise) AS amountPaise, MIN(t.occurred_at) AS at,
            a.nickname AS accountName, NULL AS sourcePackage, 'added' AS status
     FROM transactions t
     LEFT JOIN accounts a ON a.id = t.account_id
     WHERE t.split_group IS NOT NULL AND t.direction = ? AND t.occurred_at BETWEEN ? AND ?
       AND (t.reference IS NULL OR ? IS NULL) AND t.split_group ${NOT_FROM_SELF}
     GROUP BY t.split_group HAVING SUM(t.amount_paise) = ?
     LIMIT 1`,
    [direction, from, to, ref, selfId ?? -1, amountPaise],
  );
}

/**
 * Decides what a captured message is: a waiting payment (maybe a possible
 * duplicate), a duplicate, a copy to ignore, or not a payment.
 * Returns { status, parsed, accountId, possibleDuplicate }.
 */
async function readCapturedItem(db, item, selfId) {
  if (SMS_COPY_APPS.includes(item.packageName)) {
    return { status: 'ignored', parsed: null, accountId: null, possibleDuplicate: 0 };
  }
  const parsed = parsePaymentNotification(item);
  if (!parsed) {
    return { status: 'unrecognized', parsed: null, accountId: null, possibleDuplicate: 0 };
  }
  const accountId = await findOrCreateAccount(db, {
    bankName: parsed.bankName,
    bankShort: parsed.bankShort,
    last4: parsed.accountLast4,
  });
  if (parsed.reference && (await isReferenceAlreadySaved(db, parsed.reference, parsed.amountPaise, selfId))) {
    return { status: 'duplicate', parsed, accountId, possibleDuplicate: 0 };
  }
  const original = await findPossibleOriginal(db, parsed, accountId, item.postedAt, selfId);
  return { status: 'pending', parsed, accountId, possibleDuplicate: original ? 1 : 0 };
}

/** The columns a reading fills, in the order both the INSERT and the UPDATE use. */
function readingValues({ status, parsed, accountId, possibleDuplicate }) {
  return [
    status,
    parsed?.direction ?? null,
    parsed?.amountPaise ?? null,
    accountId,
    parsed?.counterparty ?? null,
    parsed?.reference ?? null,
    possibleDuplicate,
  ];
}

async function saveCapturedItem(db, item) {
  const exists = await db.getFirstAsync('SELECT id FROM detected_payments WHERE capture_id = ?', [item.id]);
  if (exists) {
    return;
  }
  const reading = await readCapturedItem(db, item, null);
  await db.runAsync(
    `INSERT INTO detected_payments
      (capture_id, source_package, title, raw_text, posted_at, created_at,
       status, direction, amount_paise, account_id, counterparty, reference, possible_duplicate)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      item.id,
      item.packageName ?? null,
      item.title ?? null,
      item.text ?? '',
      item.postedAt,
      Date.now(),
      ...readingValues(reading),
    ],
  );
}

/**
 * Reads waiting payments again, since what is around them may have changed
 * (an earlier copy added or ignored). Messages that could not be read are read
 * again only when the reader itself changed (PARSER_VERSION), because they
 * pile up and reading them all on every visit is slow.
 * Added and ignored items are never changed.
 */
async function recheckWaitingItems(db) {
  const stored = await db.getFirstAsync('SELECT value FROM settings WHERE key = ?', [PARSER_VERSION_KEY]);
  const readerChanged = Number(stored?.value) !== PARSER_VERSION;
  const statuses = readerChanged ? "('pending', 'unrecognized')" : "('pending')";
  const rows = await db.getAllAsync(
    `SELECT id, source_package AS packageName, title, raw_text AS text, posted_at AS postedAt
     FROM detected_payments WHERE status IN ${statuses}
     ORDER BY posted_at, id`,
  );
  for (const row of rows) {
    const reading = await readCapturedItem(db, row, row.id);
    await db.runAsync(
      `UPDATE detected_payments SET
         status = ?, direction = ?, amount_paise = ?, account_id = ?, counterparty = ?, reference = ?,
         possible_duplicate = ?
       WHERE id = ?`,
      [...readingValues(reading), row.id],
    );
  }
  if (readerChanged) {
    await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
      PARSER_VERSION_KEY,
      String(PARSER_VERSION),
    ]);
  }
}

/**
 * Moves captured messages from the native queue into the database. `source`
 * is the native module (or a stand-in in tests). An item leaves the queue
 * only once it is saved, so nothing is lost if the app closes halfway.
 * Returns how many were saved.
 */
export async function syncCapturedNotifications(db, source) {
  const captured = await source.getCapturedNotifications();
  const saved = [];
  for (const item of captured) {
    try {
      await db.withExclusiveTransactionAsync(async (txn) => {
        await saveCapturedItem(txn, item);
      });
      saved.push(item.id);
    } catch (error) {
      // Left in the queue to try again next time.
      console.error('Could not save a captured notification', error);
    }
  }
  await source.removeCapturedNotifications(saved);
  try {
    await db.withExclusiveTransactionAsync(async (txn) => {
      await recheckWaitingItems(txn);
    });
  } catch (error) {
    console.error('Could not re-check waiting payments', error);
  }
  return saved.length;
}

/** When the newest bank message was captured (ms), or null if none ever was. */
export async function getLastDetectedAt(db) {
  const row = await db.getFirstAsync('SELECT MAX(posted_at) AS lastAt FROM detected_payments');
  return row?.lastAt ?? null;
}
