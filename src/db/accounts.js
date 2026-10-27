// Bank accounts, identified only by bank name and the last 4 digits shown in
// bank messages. Full account numbers are never stored.

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

export async function renameAccount(db, id, rawNickname) {
  const nickname = String(rawNickname ?? '').trim();
  if (nickname === '') {
    throw new Error('Enter a name for this account.');
  }
  await db.runAsync('UPDATE accounts SET nickname = ? WHERE id = ?', [nickname.slice(0, 40), id]);
}
