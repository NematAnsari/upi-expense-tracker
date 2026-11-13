// Backup and restore: all your data as one JSON object for a file.
// Captured bank messages (detected_payments) are left out: they hold raw SMS
// text, and what you added from them is already in transactions.

import { PHONE_PREFIX } from './phoneSettings.js';
import { LATEST_VERSION } from './migrations.js';
import { INCOME, UNCATEGORIZED, LOANS_CATEGORY } from '../constants/categories.js';
import { placeholders } from './sql.js';

const BACKUP_APP = 'upi-expense-tracker';
const BACKUP_FORMAT = 1;

// Parents before children, so foreign keys always find their row on restore.
const BACKUP_TABLES = [
  'categories',
  'accounts',
  'shop_accounts',
  'templates',
  'transactions',
  'name_memory',
  'settings',
];

const LAST_BACKUP_KEY = 'last_backup_at';

// Settings a backup leaves out and a restore leaves alone: the last backup
// time, and this phone's own settings (see phoneSettings.js).
function isPhoneOnlySetting(key) {
  return key === LAST_BACKUP_KEY || String(key ?? '').startsWith(PHONE_PREFIX);
}
// The same rule in SQL: every other setting.
const SHARED_SETTINGS = { sql: 'key <> ? AND key NOT LIKE ?', params: [LAST_BACKUP_KEY, `${PHONE_PREFIX}%`] };

/** The whole database as a plain object, ready for JSON.stringify. */
export async function buildBackup(db, now = Date.now()) {
  const version = await db.getFirstAsync('PRAGMA user_version');
  const tables = {};
  for (const table of BACKUP_TABLES) {
    tables[table] =
      table === 'settings'
        ? await db.getAllAsync(`SELECT * FROM settings WHERE ${SHARED_SETTINGS.sql}`, SHARED_SETTINGS.params)
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
export async function countTransactions(db) {
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
  for (const table of BACKUP_TABLES) {
    const rows = backup.tables[table] ?? [];
    if (!Array.isArray(rows) || rows.some((row) => typeof row !== 'object' || row === null)) {
      return { error: 'This backup file is damaged.' };
    }
  }
  // Every real backup has categories. Without them nothing could be saved after restoring.
  if ((backup.tables.categories ?? []).length === 0) {
    return { error: 'This backup file is damaged.' };
  }
  return { summary: { entries: (backup.tables.transactions ?? []).length, createdAt: backup.createdAt ?? null } };
}

/**
 * Replaces everything on this phone with the backup. All or nothing: if any
 * row fails, nothing changes. A backup from an older version still works:
 * columns it does not have get their defaults, and the built-in categories
 * it lacks (Income, Uncategorized, Loans) are added.
 */
export async function restoreBackup(db, backup) {
  const checked = checkBackup(backup);
  if (checked.error) {
    throw new Error(checked.error);
  }
  await db.withExclusiveTransactionAsync(async (txn) => {
    // Children before parents, so nothing is left pointing at a deleted row.
    await txn.runAsync('DELETE FROM detected_payments');
    for (const table of [...BACKUP_TABLES].reverse()) {
      await txn.runAsync(
        table === 'settings' ? `DELETE FROM settings WHERE ${SHARED_SETTINGS.sql}` : `DELETE FROM ${table}`,
        table === 'settings' ? SHARED_SETTINGS.params : [],
      );
    }
    for (const table of BACKUP_TABLES) {
      // Only columns this app version knows. Names come from the database, never the file.
      const known = (await txn.getAllAsync(`PRAGMA table_info(${table})`)).map((column) => column.name);
      for (const row of backup.tables[table] ?? []) {
        if (table === 'settings' && isPhoneOnlySetting(row.key)) {
          continue;
        }
        const columns = known.filter((name) => name in row);
        if (columns.length === 0) {
          continue;
        }
        await txn.runAsync(
          `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders(columns.length)})`,
          columns.map((name) => row[name]),
        );
      }
    }
    // Built-in categories added in versions 3 and 4 may be missing from an older backup.
    for (const name of [INCOME, UNCATEGORIZED, LOANS_CATEGORY]) {
      await txn.runAsync(
        `INSERT OR IGNORE INTO categories (name, is_default, sort_order, created_at)
         VALUES (?, 1, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories), ?)`,
        [name, Date.now()],
      );
    }
  });
  return checked.summary;
}
