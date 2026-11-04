// Moves a backup between the database and a file: save one and open the
// share sheet (Google Drive, WhatsApp, email...), or pick one and read it.

import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { buildBackup, markBackupSaved } from '../db/backup';
import { getMonthKey } from '../utils/dates';

/**
 * Writes a backup file and opens the share sheet so you can keep it somewhere
 * safe off the phone. Returns how many entries it holds.
 */
export async function shareBackup(db) {
  const backup = await buildBackup(db);
  const file = new File(Paths.cache, `expense-backup-${getMonthKey()}-${Date.now()}.json`);
  if (file.exists) {
    file.delete();
  }
  file.create();
  file.write(JSON.stringify(backup));
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this phone.');
  }
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save your backup' });
  await markBackupSaved(db);
  return backup.tables.transactions.length;
}

/** Lets you pick a backup file. Returns the parsed backup, or null if you cancelled. */
export async function pickBackup() {
  const result = await DocumentPicker.getDocumentAsync({
    // Some apps label .json files as plain text or a generic file.
    type: ['application/json', 'text/plain', 'application/octet-stream'],
    copyToCacheDirectory: true,
  });
  if (result.canceled) {
    return null;
  }
  const text = await new File(result.assets[0].uri).text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('This file is not a backup from this app.');
  }
}
