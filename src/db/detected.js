// Payments detected from notifications. Nothing here saves an expense on its
// own: detected items wait as "pending" until you tap Add or Ignore.

import { INCOME, suggestCategoryName, UNCATEGORIZED } from '../domain/categorize.js';
import { parsePaymentNotification } from '../domain/paymentParser.js';
import { findOrCreateAccount } from './accounts.js';
import { createTransaction, insertSplitPayment } from './transactions.js';

// Same amount, direction and account within this window might be one payment
// reported twice. It is flagged for you to decide, never merged silently.
const POSSIBLE_DUPLICATE_WINDOW_MS = 15 * 60 * 1000;

const SELECT_DETECTED = `
  SELECT
    d.id,
    d.title,
    d.raw_text AS rawText,
    d.source_package AS sourcePackage,
    d.posted_at AS postedAt,
    d.direction,
    d.amount_paise AS amountPaise,
    d.account_id AS accountId,
    a.nickname AS accountName,
    d.counterparty,
    d.reference,
    d.status,
    d.possible_duplicate AS possibleDuplicate,
    d.transaction_id AS transactionId
  FROM detected_payments d
  LEFT JOIN accounts a ON a.id = d.account_id
`;

// Apps that only re-show a bank SMS you already receive (so every payment
// would appear twice). Their notifications are ignored automatically.
const MIRROR_APPS = ['com.truecaller'];

// `selfId` is the row being checked (null for a new one). Rows only compare
// against EARLIER rows, so the first of a pair stays normal and the later one
// is the one marked.

async function isKnownReference(db, reference, amountPaise, selfId) {
  const saved = await db.getFirstAsync(
    `SELECT t.id FROM transactions t
     WHERE t.reference = ? AND t.amount_paise = ?
       AND t.id NOT IN (SELECT transaction_id FROM detected_payments WHERE id = ? AND transaction_id IS NOT NULL)
     LIMIT 1`,
    [reference, amountPaise, selfId ?? -1],
  );
  if (saved) {
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
 * Finds an earlier payment this one may repeat, or null. Returns what is
 * needed to describe it: { kind: 'detected' | 'saved', direction, amountPaise,
 * at, accountName, sourcePackage, status }.
 */
async function findPossibleOriginal(db, { direction, amountPaise, reference }, accountId, postedAt, selfId) {
  const from = postedAt - POSSIBLE_DUPLICATE_WINDOW_MS;
  const to = postedAt + POSSIBLE_DUPLICATE_WINDOW_MS;
  // Two different UPI references are always two different payments. So a
  // match only counts when at least one side has no reference.
  const ref = reference ?? null;
  // A UPI app's notification often has no account, so an unknown account on
  // either side still counts as a possible match.
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
  return db.getFirstAsync(
    `SELECT 'saved' AS kind, t.direction, t.amount_paise AS amountPaise, t.occurred_at AS at,
            a.nickname AS accountName, NULL AS sourcePackage, 'added' AS status
     FROM transactions t
     LEFT JOIN accounts a ON a.id = t.account_id
     WHERE t.direction = ? AND t.amount_paise = ? AND t.occurred_at BETWEEN ? AND ?
       AND (t.reference IS NULL OR ? IS NULL)
       AND t.id NOT IN (SELECT transaction_id FROM detected_payments WHERE id = ? AND transaction_id IS NOT NULL)
     LIMIT 1`,
    [direction, amountPaise, from, to, ref, selfId ?? -1],
  );
}

async function looksLikeDuplicate(db, parsed, accountId, postedAt, selfId) {
  return Boolean(await findPossibleOriginal(db, parsed, accountId, postedAt, selfId));
}

/** Decides what a captured notification is. Used for new items and to re-check waiting ones. */
async function classify(db, item, selfId) {
  if (MIRROR_APPS.includes(item.packageName)) {
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
  if (parsed.reference && (await isKnownReference(db, parsed.reference, parsed.amountPaise, selfId))) {
    return { status: 'duplicate', parsed, accountId, possibleDuplicate: 0 };
  }
  const possibleDuplicate = (await looksLikeDuplicate(db, parsed, accountId, item.postedAt, selfId)) ? 1 : 0;
  return { status: 'pending', parsed, accountId, possibleDuplicate };
}

async function saveCaptured(db, item) {
  const exists = await db.getFirstAsync('SELECT id FROM detected_payments WHERE capture_id = ?', [item.id]);
  if (exists) {
    return;
  }
  const { status, parsed, accountId, possibleDuplicate } = await classify(db, item, null);
  await db.runAsync(
    `INSERT INTO detected_payments
      (capture_id, source_package, title, raw_text, posted_at, created_at, status,
       direction, amount_paise, account_id, counterparty, reference, possible_duplicate)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      item.id,
      item.packageName ?? null,
      item.title ?? null,
      item.text ?? '',
      item.postedAt,
      Date.now(),
      status,
      parsed?.direction ?? null,
      parsed?.amountPaise ?? null,
      accountId,
      parsed?.counterparty ?? null,
      parsed?.reference ?? null,
      possibleDuplicate,
    ],
  );
}

/**
 * Re-reads items you have not acted on yet, so improvements to the reader
 * also fix payments already waiting in your list. Added and ignored items are
 * never changed.
 */
async function recheckWaitingItems(db) {
  const rows = await db.getAllAsync(
    `SELECT id, source_package AS packageName, title, raw_text AS text, posted_at AS postedAt
     FROM detected_payments WHERE status IN ('pending', 'unrecognized')
     ORDER BY posted_at, id`,
  );
  for (const row of rows) {
    const { status, parsed, accountId, possibleDuplicate } = await classify(db, row, row.id);
    await db.runAsync(
      `UPDATE detected_payments SET
         status = ?, direction = ?, amount_paise = ?, account_id = ?, counterparty = ?, reference = ?,
         possible_duplicate = ?
       WHERE id = ?`,
      [
        status,
        parsed?.direction ?? null,
        parsed?.amountPaise ?? null,
        accountId,
        parsed?.counterparty ?? null,
        parsed?.reference ?? null,
        possibleDuplicate,
        row.id,
      ],
    );
  }
}

/**
 * Moves captured notifications from the native queue into the database.
 * `source` is the native module (or a fake one in tests). An item is removed
 * from the queue only after it is safely saved, so nothing is lost if the app
 * closes halfway. Returns how many items were processed.
 */
export async function syncCapturedNotifications(db, source) {
  const captured = await source.getCapturedNotifications();
  const saved = [];
  for (const item of captured) {
    try {
      await db.withExclusiveTransactionAsync(async (txn) => {
        await saveCaptured(txn, item);
      });
      saved.push(item.id);
    } catch (error) {
      // Leave it in the queue to retry next time.
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

export async function countPendingDetected(db) {
  const row = await db.getFirstAsync("SELECT COUNT(*) AS count FROM detected_payments WHERE status = 'pending'");
  return row?.count ?? 0;
}

/** The category to suggest: what you used before for this name, else a keyword match. */
async function suggestCategoryId(db, detected, categories) {
  if (detected.direction === 'debit' && detected.counterparty) {
    const previous = await db.getFirstAsync(
      `SELECT category_id AS categoryId FROM transactions
       WHERE lower(merchant) = lower(?) AND direction = 'debit'
       ORDER BY created_at DESC LIMIT 1`,
      [detected.counterparty],
    );
    if (previous) {
      return previous.categoryId;
    }
  }
  const name = suggestCategoryName(detected.counterparty, detected.direction);
  const byName = (wanted) => categories.find((category) => category.name.toLowerCase() === wanted.toLowerCase());
  return (
    (byName(name) ?? byName(detected.direction === 'credit' ? INCOME : UNCATEGORIZED) ?? byName('Other'))?.id ?? null
  );
}

/** What you saved last time for this bank name, or null. See rememberName. */
async function getNameMemory(db, bankName) {
  if (!bankName) {
    return null;
  }
  return db.getFirstAsync(
    `SELECT merchant, category_id AS categoryId, loan_type AS loanType FROM name_memory WHERE bank_name = ?`,
    [bankName.trim()],
  );
}

/**
 * Remembers what you saved for a name as the bank writes it, so the next
 * payment with that name comes in already filled: your spelling ("Rahul" for
 * "RAHUL KUMAR S"), the category (expenses and income), and whether it was
 * money given or taken. Money received back or returned keeps what was
 * remembered before, since those are suggested from the remaining amount.
 */
async function rememberName(db, bankName, values) {
  const key = bankName?.trim();
  if (!key) {
    return;
  }
  const before = await getNameMemory(db, key);
  const isReturn = values.loanType === 'lent_repaid' || values.loanType === 'borrowed_repaid';
  const loanType = isReturn ? (before?.loanType ?? null) : (values.loanType ?? null);
  const categoryId = values.loanType ? (before?.categoryId ?? null) : values.categoryId;
  await db.runAsync(
    `INSERT INTO name_memory (bank_name, merchant, category_id, loan_type, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (bank_name) DO UPDATE SET
       merchant = excluded.merchant, category_id = excluded.category_id,
       loan_type = excluded.loan_type, updated_at = excluded.updated_at`,
    [key, values.merchant ?? null, categoryId, loanType, Date.now()],
  );
}

/**
 * Pending items, newest first, each with a suggested category and, for
 * possible duplicates, the earlier payment it may repeat (`original`).
 * A name seen before comes back as you saved it: `counterparty` is your
 * spelling, `bankName` the bank's, and `rememberedLoanType` is 'lent' or
 * 'borrowed' when you saved this name as money given or taken.
 */
export async function listPendingDetected(db, categories) {
  const rows = await db.getAllAsync(`${SELECT_DETECTED} WHERE d.status = 'pending' ORDER BY d.posted_at DESC`);
  const withSuggestions = [];
  for (const row of rows) {
    const memory = await getNameMemory(db, row.counterparty);
    const rememberedCategory = categories.find((category) => category.id === memory?.categoryId);
    const suggestedCategoryId = rememberedCategory?.id ?? (await suggestCategoryId(db, row, categories));
    const suggested = categories.find((category) => category.id === suggestedCategoryId);
    const original = row.possibleDuplicate
      ? await findPossibleOriginal(db, row, row.accountId, row.postedAt, row.id)
      : null;
    const rememberedLoanType = isValidRemembered(memory?.loanType, row.direction) ? memory.loanType : null;
    withSuggestions.push({
      ...row,
      bankName: row.counterparty,
      counterparty: memory?.merchant || row.counterparty,
      rememberedLoanType,
      suggestedCategoryId,
      suggestedCategoryName: suggested?.name ?? null,
      original,
    });
  }
  return withSuggestions;
}

/** Money given is money out and money taken is money in, so only a matching direction is used. */
function isValidRemembered(loanType, direction) {
  return (loanType === 'lent' && direction === 'debit') || (loanType === 'borrowed' && direction === 'credit');
}

/**
 * Undo an Add: deletes the saved transaction and puts the item back in the
 * review list. Only works while the transaction still came from this item.
 */
export async function undoAddDetected(db, detectedId) {
  await db.withExclusiveTransactionAsync(async (txn) => {
    const row = await txn.getFirstAsync(
      'SELECT status, transaction_id AS transactionId FROM detected_payments WHERE id = ?',
      [detectedId],
    );
    if (row?.status !== 'added') {
      throw new Error('This payment can no longer be undone.');
    }
    if (row.transactionId != null) {
      // A split payment removes all its parts.
      await txn.runAsync("DELETE FROM transactions WHERE (id = ? OR split_group = ?) AND source = 'notification'", [
        row.transactionId,
        row.transactionId,
      ]);
    }
    await txn.runAsync("UPDATE detected_payments SET status = 'pending', transaction_id = NULL WHERE id = ?", [
      detectedId,
    ]);
  });
}

/** Recent captures of every status, for the Payment Detection screen. */
export async function listRecentDetected(db, limit = 50) {
  return db.getAllAsync(`${SELECT_DETECTED} ORDER BY d.posted_at DESC LIMIT ?`, [limit]);
}

/**
 * The transaction a detected payment becomes when you tap Add. loanType is
 * set when you marked it as money lent, borrowed or paid back.
 */
export function detectedToTransaction(detected, categoryId, loanType = null) {
  return {
    amountPaise: detected.amountPaise,
    direction: detected.direction,
    loanType,
    accountId: detected.accountId,
    purpose: null,
    categoryId,
    occurredAt: detected.postedAt,
    paymentMethod: 'UPI',
    merchant: detected.counterparty,
    reference: detected.reference,
    notes: null,
    source: 'notification',
  };
}

/**
 * Saves a detected payment as a transaction and marks it added. What you
 * saved is remembered for the bank's name (see rememberName).
 * Fails (without saving) if it was already added or ignored, so a double tap
 * cannot create two expenses.
 * split: { parts, loansCategoryId } to save it as a split payment (see createSplitPayment).
 */
export async function addDetectedAsTransaction(db, detectedId, values, split = null) {
  let transactionId = null;
  await db.withExclusiveTransactionAsync(async (txn) => {
    const row = await txn.getFirstAsync('SELECT status, counterparty FROM detected_payments WHERE id = ?', [
      detectedId,
    ]);
    if (row?.status !== 'pending') {
      throw new Error('This payment was already handled.');
    }
    const saved = { ...values, source: 'notification' };
    transactionId = split
      ? await insertSplitPayment(txn, saved, split.parts, split.loansCategoryId)
      : await createTransaction(txn, saved);
    await rememberName(txn, row.counterparty, values);
    await txn.runAsync("UPDATE detected_payments SET status = 'added', transaction_id = ? WHERE id = ?", [
      transactionId,
      detectedId,
    ]);
  });
  return transactionId;
}

/**
 * After you edit an entry that came from a bank SMS, remember the corrected
 * name, category and type for that bank name, as Add does. Does nothing for
 * entries you typed in yourself.
 */
export async function rememberEditedName(db, transactionId, values) {
  const row = await db.getFirstAsync(
    "SELECT counterparty FROM detected_payments WHERE transaction_id = ? AND status = 'added'",
    [transactionId],
  );
  if (row?.counterparty) {
    await rememberName(db, row.counterparty, values);
  }
}

/** Undo an Ignore: the item goes back to the review list (and is re-checked there). */
export async function restoreDetected(db, detectedId) {
  await db.runAsync("UPDATE detected_payments SET status = 'pending' WHERE id = ? AND status = 'ignored'", [
    detectedId,
  ]);
}

export async function ignoreDetected(db, detectedId) {
  await db.runAsync("UPDATE detected_payments SET status = 'ignored' WHERE id = ? AND status = 'pending'", [
    detectedId,
  ]);
}
