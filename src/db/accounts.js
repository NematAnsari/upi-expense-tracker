// Bank accounts, identified only by bank name and the last 4 digits shown in
// bank messages, or added by hand with just a name. Full account numbers are
// never stored.

import { MAX_ACCOUNT_NAME_LENGTH } from '../domain/validation.js';

/** The nickname trimmed and cut to the limit. Throws when it is empty. */
function cleanNickname(rawNickname) {
  const nickname = String(rawNickname ?? '')
    .trim()
    .slice(0, MAX_ACCOUNT_NAME_LENGTH);
  if (nickname === '') {
    throw new Error('Enter a name for this account.');
  }
  return nickname;
}

export async function listAccounts(db) {
  return db.getAllAsync(
    'SELECT id, bank_name AS bankName, last4, nickname FROM accounts ORDER BY nickname COLLATE NOCASE',
  );
}

/** Returns the account's id, creating it with a default nickname like "Kotak ••1234". */
export async function findOrCreateAccount(db, { bankName, bankShort, last4 }) {
  if (!last4) {
    return null;
  }
  // "IS" (not "=") so a missing bank name matches another missing bank name.
  const existing = await db.getFirstAsync('SELECT id FROM accounts WHERE bank_name IS ? AND last4 = ?', [
    bankName ?? null,
    last4,
  ]);
  if (existing) {
    return existing.id;
  }
  const nickname = `${bankShort ?? 'Account'} ••${last4}`;
  const result = await db.runAsync(
    'INSERT INTO accounts (bank_name, last4, nickname, created_at) VALUES (?, ?, ?, ?)',
    [bankName ?? null, last4, nickname, Date.now()],
  );
  return result.lastInsertRowId;
}

/**
 * Adds an account by hand (for a bank that sends no SMS, or a wallet).
 * Only a name is stored: no bank name or digits. Names must not be empty or
 * already used (ignoring case). Returns the new account.
 */
export async function createAccount(db, rawNickname) {
  const nickname = cleanNickname(rawNickname);
  const taken = await db.getFirstAsync('SELECT id FROM accounts WHERE lower(nickname) = lower(?)', [nickname]);
  if (taken) {
    throw new Error('You already have an account with this name.');
  }
  const result = await db.runAsync(
    'INSERT INTO accounts (bank_name, last4, nickname, created_at) VALUES (NULL, NULL, ?, ?)',
    [nickname, Date.now()],
  );
  return { id: result.lastInsertRowId, bankName: null, last4: null, nickname };
}

export async function renameAccount(db, id, rawNickname) {
  await db.runAsync('UPDATE accounts SET nickname = ? WHERE id = ?', [cleanNickname(rawNickname), id]);
}
