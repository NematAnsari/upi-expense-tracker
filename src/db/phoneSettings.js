// Settings for this phone only (app lock, automatic backup folder). Backups
// leave out keys starting with "device_", so they never reach another phone.

export const PHONE_PREFIX = 'device_';

export const PHONE_KEYS = {
  appLock: 'device_app_lock',
  autoBackupOn: 'device_auto_backup_on',
  // The folder you picked, as Android names it (a content:// address).
  autoBackupFolder: 'device_auto_backup_folder',
  autoBackupLastAt: 'device_auto_backup_last_at',
  // Why the last automatic backup failed, or empty when it worked.
  autoBackupError: 'device_auto_backup_error',
};

/** One setting's text, or null when it was never set (or set to empty). */
export async function getPhoneSetting(db, key) {
  const row = await db.getFirstAsync('SELECT value FROM settings WHERE key = ?', [key]);
  return row?.value ? row.value : null;
}

/** Saves one setting. null or '' clears it. */
export async function setPhoneSetting(db, key, value) {
  await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
    key,
    value == null ? '' : String(value),
  ]);
}

/** The automatic backup settings together: { on, folder, lastAt, error }. */
export async function getAutoBackupSettings(db) {
  const { autoBackupOn, autoBackupFolder, autoBackupLastAt, autoBackupError } = PHONE_KEYS;
  const rows = await db.getAllAsync('SELECT key, value FROM settings WHERE key IN (?, ?, ?, ?)', [
    autoBackupOn,
    autoBackupFolder,
    autoBackupLastAt,
    autoBackupError,
  ]);
  // Empty counts as not set, as in getPhoneSetting.
  const values = Object.fromEntries(rows.map((row) => [row.key, row.value || null]));
  return {
    on: values[autoBackupOn] === '1',
    folder: values[autoBackupFolder] ?? null,
    lastAt: values[autoBackupLastAt] ? Number(values[autoBackupLastAt]) : null,
    error: values[autoBackupError] ?? null,
  };
}
