// Rules for the daily automatic backup, with no file or database code so
// they can be tested: when one is due, what the file is called, and which
// old files to remove.

const PREFIX = 'expense-auto-backup-';
// One file a day; this many days are kept.
export const AUTO_BACKUPS_KEPT = 7;

const two = (value) => String(value).padStart(2, '0');

/** "2026-11-11": the local calendar day. */
function dayKey(ms) {
  const date = new Date(ms);
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

/** Due when no automatic backup was made yet today (by the phone's own calendar). */
export function isAutoBackupDue(lastAt, now = Date.now()) {
  return lastAt == null || dayKey(lastAt) !== dayKey(now);
}

/** "expense-auto-backup-2026-11-11.json": one file per day, so a second run the same day replaces it. */
export function autoBackupFileName(now = Date.now()) {
  return `${PREFIX}${dayKey(now)}.json`;
}

/** True for a file this feature made (other files in the folder are never touched). */
export function isAutoBackupFile(name) {
  return name.startsWith(PREFIX) && name.endsWith('.json');
}

/**
 * Which automatic backup files to delete so only the newest `keep` stay.
 * names: every file name in the folder. The date in the name sorts as text.
 */
export function autoBackupsToRemove(names, keep = AUTO_BACKUPS_KEPT) {
  return names.filter(isAutoBackupFile).sort().reverse().slice(keep);
}
