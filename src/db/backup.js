// Backup and restore: all your data as one JSON object, so it can be saved
// to a file and brought back on this or a new phone.
// Captured bank messages (detected_payments) are left out: they hold the raw
// SMS text, and everything you added from them is already in transactions.

import { LATEST_VERSION } from './migrations.js';

const BACKUP_APP = 'upi-expense-tracker';
const BACKUP_FORMAT = 1;

// Parents before children, so foreign keys always find their row on restore.
const TABLES = ['categories', 'accounts', 'templates', 'transactions', 'name_memory', 'settings'];

const LAST_BACKUP_KEY = 'last_backup_at';

/** The whole database as a plain object, ready for JSON.stringify. */
export async function buildBackup(db, now = Date.now()) {
  const version = await db.getFirstAsync('PRAGMA user_version');
  const tables = {};
  for (const table of TABLES) {
    // Settings hold app state (like the last backup time), not your data.
    tables[table] =
      table === 'settings'
        ? await db.getAllAsync('SELECT * FROM settings WHERE key <> ?', [LAST_BACKUP_KEY])
        : await db.getAllAsync(`SELECT * FROM ${table}`);
  }
  return {
    app: BACKUP_APP,
    format: BACKUP_FORMAT,
    schemaVersion: version?.user_version ?? 0,
    createdAt: now,
    tables,
  };
}

/** Remembers when a backup was last saved, for the Backup screen. */
export async function markBackupSaved(db, now = Date.now()) {
  await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [LAST_BACKUP_KEY, String(now)]);
}

export async function getLastBackupAt(db) {
  const row = await db.getFirstAsync('SELECT value FROM settings WHERE key = ?', [LAST_BACKUP_KEY]);
  return row ? Number(row.value) : null;
}

/** How many entries are on this phone, to compare with a backup before replacing. */
export async function countEntries(db) {
  const row = await db.getFirstAsync('SELECT COUNT(*) AS count FROM transactions');
  return row?.count ?? 0;
}

/**
 * Checks a parsed backup file. Returns { error } with a message to show, or
 * { summary: { entries, createdAt } } when it can be restored.
 */
export function checkBackup(backup) {
  if (!backup || backup.app !== BACKUP_APP || typeof backup.tables !== 'object' || backup.tables === null) {
    return { error: 'This file is not a backup from this app.' };
  }
  if (backup.format !== BACKUP_FORMAT) {
    return { error: 'This backup was made by a different version of the app.' };
  }
  if (!Number.isInteger(backup.schemaVersion) || backup.schemaVersion > LATEST_VERSION) {
    return { error: 'This backup is from a newer version of the app. Update the app first, then restore.' };
  }
  for (const table of TABLES) {
    const rows = backup.tables[table] ?? [];
    if (!Array.isArray(rows) || rows.some((row) => typeof row !== 'object' || row === null)) {
      return { error: 'This backup file is damaged.' };
    }
  }
  return { summary: { entries: (backup.tables.transactions ?? []).length, createdAt: backup.createdAt ?? null } };
}

/**
 * Replaces everything on this phone with the backup. All or nothing: if any
 * row fails, nothing changes. A backup from an older version still works:
 * columns it does not have get their defaults.
 */
export async function restoreBackup(db, backup) {
  const checked = checkBackup(backup);
  if (checked.error) {
    throw new Error(checked.error);
  }
  await db.withExclusiveTransactionAsync(async (txn) => {
    // Children before parents, so nothing is left pointing at a deleted row.
    await txn.runAsync('DELETE FROM detected_payments');
    for (const table of [...TABLES].reverse()) {
      await txn.runAsync(
        table === 'settings' ? 'DELETE FROM settings WHERE key <> ?' : `DELETE FROM ${table}`,
        table === 'settings' ? [LAST_BACKUP_KEY] : [],
      );
    }
    for (const table of TABLES) {
      // Only columns this version of the app knows; names come from the
      // database itself, never from the file, so they are safe in the SQL.
      const known = (await txn.getAllAsync(`PRAGMA table_info(${table})`)).map((column) => column.name);
      for (const row of backup.tables[table] ?? []) {
        if (table === 'settings' && row.key === LAST_BACKUP_KEY) {
          continue;
        }
        const columns = known.filter((name) => name in row);
        if (columns.length === 0) {
          continue;
        }
        await txn.runAsync(
          `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
          columns.map((name) => row[name]),
        );
      }
    }
  });
  return checked.summary;
}
