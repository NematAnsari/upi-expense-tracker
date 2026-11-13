// Rules for the daily automatic backup: when one is due, what the file is
// called, and which old files go. No file or database code, so it can be tested.

import { getDayKey } from '../utils/dates.js';

const PREFIX = 'expense-auto-backup-';
// One file a day; this many days are kept.
export const AUTO_BACKUPS_KEPT = 7;

/** Due when no automatic backup was made yet today (by the phone's own calendar). */
export function isAutoBackupDue(lastAt, now = Date.now()) {
  return lastAt == null || getDayKey(lastAt) !== getDayKey(now);
}

/** "expense-auto-backup-2026-11-11.json": one file per day, so a second run the same day replaces it. */
export function autoBackupFileName(now = Date.now()) {
  return `${PREFIX}${getDayKey(now)}.json`;
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
