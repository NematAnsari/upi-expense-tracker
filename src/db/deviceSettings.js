// Settings that belong to this phone only: the app lock switch and the
// automatic backup folder. Their keys start with "device_", and backup files
// leave them out (see backup.js), so they never travel to another phone,
// where the folder would not exist and a lock would come as a surprise.

export const DEVICE_PREFIX = 'device_';

export const DEVICE_KEYS = {
  appLock: 'device_app_lock',
  autoBackupOn: 'device_auto_backup_on',
  // The folder you picked, as Android names it (a content:// address).
  autoBackupFolder: 'device_auto_backup_folder',
  autoBackupLastAt: 'device_auto_backup_last_at',
  // Why the last automatic backup failed, or empty when it worked.
  autoBackupError: 'device_auto_backup_error',
};

/** One setting's text, or null when it was never set (or set to empty). */
export async function getDeviceSetting(db, key) {
  const row = await db.getFirstAsync('SELECT value FROM settings WHERE key = ?', [key]);
  return row?.value ? row.value : null;
}

/** Saves one setting. null or '' clears it. */
export async function setDeviceSetting(db, key, value) {
  await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
    key,
    value == null ? '' : String(value),
  ]);
}

/** The automatic backup settings together: { on, folder, lastAt, error }. */
export async function getAutoBackupSettings(db) {
  const [on, folder, lastAt, error] = await Promise.all([
    getDeviceSetting(db, DEVICE_KEYS.autoBackupOn),
    getDeviceSetting(db, DEVICE_KEYS.autoBackupFolder),
    getDeviceSetting(db, DEVICE_KEYS.autoBackupLastAt),
    getDeviceSetting(db, DEVICE_KEYS.autoBackupError),
  ]);
  return { on: on === '1', folder, lastAt: lastAt ? Number(lastAt) : null, error };
}
