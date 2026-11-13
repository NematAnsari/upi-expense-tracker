// Automatic backup: once a day a backup file is written into a folder you
// picked once (for example one that Google Drive keeps in sync). It runs at
// night when Android allows background work (see autoBackupTask.js), and
// when you open the app if that night was missed. The newest AUTO_BACKUPS_KEPT files stay.

import { Directory } from 'expo-file-system';
import { buildBackup, markBackupSaved } from '../db/backup';
import { PHONE_KEYS, getAutoBackupSettings, setPhoneSetting } from '../db/phoneSettings';
import { autoBackupFileName, autoBackupsToRemove, isAutoBackupDue } from '../domain/autoBackupSchedule';

/**
 * Opens Android's folder picker. Returns the folder's address to save, or
 * null when you backed out. Android remembers the permission, so this is
 * asked only once.
 */
export async function pickBackupFolder() {
  try {
    const folder = await Directory.pickDirectoryAsync();
    return folder?.uri ?? null;
  } catch (error) {
    // Closing the picker without choosing counts as backing out.
    console.warn('No backup folder chosen', error);
    return null;
  }
}

/** The folder's last part, to show which one is used: "Backups". */
export function folderName(uri) {
  if (!uri) {
    return null;
  }
  const decoded = decodeURIComponent(uri);
  const last = decoded.split(/[/:]/).filter(Boolean).pop();
  return last || 'Chosen folder';
}

/**
 * Writes today's backup file into the folder and removes automatic backups
 * beyond the newest AUTO_BACKUPS_KEPT. Records the time, or the reason it failed.
 * Returns { ok, error }.
 */
export async function writeAutoBackup(db, folderUri, now = Date.now()) {
  try {
    const folder = new Directory(folderUri);
    const name = autoBackupFileName(now);
    // The same day again: replace that day's file.
    const others = [];
    for (const item of folder.list()) {
      if (item.name === name) {
        item.delete();
      } else {
        others.push(item);
      }
    }
    const file = folder.createFile(name, 'application/json');
    file.write(JSON.stringify(await buildBackup(db, now)));

    const items = [...others, file];
    const remove = autoBackupsToRemove(items.map((item) => item.name));
    for (const item of items) {
      if (remove.includes(item.name)) {
        item.delete();
      }
    }
    await setPhoneSetting(db, PHONE_KEYS.autoBackupLastAt, now);
    await setPhoneSetting(db, PHONE_KEYS.autoBackupError, '');
    // A file really was saved, so the "back up" reminder can rest.
    await markBackupSaved(db, now);
    return { ok: true, error: null };
  } catch (error) {
    console.error('Automatic backup failed', error);
    const message = error?.message || 'The folder could not be written to.';
    await setPhoneSetting(db, PHONE_KEYS.autoBackupError, message).catch(() => {});
    return { ok: false, error: message };
  }
}

/**
 * Runs the backup when it is switched on, a folder is chosen and none was
 * made yet today. Returns 'done', 'failed' or 'skipped'. Never throws.
 */
export async function runAutoBackupIfDue(db, now = Date.now()) {
  try {
    const settings = await getAutoBackupSettings(db);
    if (!settings.on || !settings.folder || !isAutoBackupDue(settings.lastAt, now)) {
      return 'skipped';
    }
    const result = await writeAutoBackup(db, settings.folder, now);
    return result.ok ? 'done' : 'failed';
  } catch (error) {
    console.error('Automatic backup check failed', error);
    return 'failed';
  }
}
