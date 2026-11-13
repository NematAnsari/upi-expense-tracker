// App lock and automatic backup: the rules that do not need a phone.
// (The lock prompt, the folder picker and the nightly run are checked on a device.)

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildBackup, restoreBackup } from '../src/db/backup.js';
import { DEVICE_KEYS, getAutoBackupSettings, getDeviceSetting, setDeviceSetting } from '../src/db/deviceSettings.js';
import {
  AUTO_BACKUPS_KEPT,
  autoBackupFileName,
  autoBackupsToRemove,
  isAutoBackupDue,
  isAutoBackupFile,
} from '../src/domain/autoBackup.js';
import { createTestDatabase } from './helpers/testDatabase.js';

const at = (day, hour, minute = 0) => new Date(2026, 10, day, hour, minute).getTime();

test('one automatic backup a day, by the phone calendar', () => {
  assert.equal(isAutoBackupDue(null, at(12, 0, 5)), true, 'never made yet');
  assert.equal(isAutoBackupDue(at(12, 0, 5), at(12, 23, 59)), false, 'already made today');
  assert.equal(isAutoBackupDue(at(12, 23, 59), at(13, 0, 1)), true, 'a new day, even a minute later');
  assert.equal(autoBackupFileName(at(3, 0, 10)), 'expense-auto-backup-2026-11-03.json');
});

test('only the newest automatic backups stay, and other files are never touched', () => {
  const days = Array.from({ length: 10 }, (_, index) => autoBackupFileName(at(index + 1, 0)));
  const names = [...days, 'my-notes.txt', 'expense-backup-2026-11-1760000000000.json'];
  const removed = autoBackupsToRemove(names);
  assert.equal(removed.length, days.length - AUTO_BACKUPS_KEPT);
  assert.deepEqual(removed.sort(), days.slice(0, days.length - AUTO_BACKUPS_KEPT).sort(), 'the oldest go');
  assert.equal(isAutoBackupFile('my-notes.txt'), false);
  assert.equal(isAutoBackupFile('expense-backup-2026-11-1760000000000.json'), false, 'a backup you saved by hand');
});

test("this phone's own settings never go into a backup file, and a restore keeps them", async () => {
  const { db } = await createTestDatabase();
  await setDeviceSetting(db, DEVICE_KEYS.appLock, '1');
  await setDeviceSetting(db, DEVICE_KEYS.autoBackupOn, '1');
  await setDeviceSetting(db, DEVICE_KEYS.autoBackupFolder, 'content://test/folder');
  await setDeviceSetting(db, DEVICE_KEYS.autoBackupLastAt, at(12, 0, 5));
  await db.runAsync("INSERT INTO settings (key, value) VALUES ('small_note', 'kept')");

  const backup = JSON.parse(JSON.stringify(await buildBackup(db)));
  const keys = backup.tables.settings.map((row) => row.key);
  assert.deepEqual(keys, ['small_note'], 'only shared settings travel');

  // Another phone with its own lock and folder: a restore leaves them alone.
  const { db: other } = await createTestDatabase();
  await setDeviceSetting(other, DEVICE_KEYS.appLock, '1');
  await setDeviceSetting(other, DEVICE_KEYS.autoBackupFolder, 'content://other/folder');
  await restoreBackup(other, backup);
  assert.equal(await getDeviceSetting(other, DEVICE_KEYS.appLock), '1');
  assert.equal(await getDeviceSetting(other, DEVICE_KEYS.autoBackupFolder), 'content://other/folder');
  assert.equal(await getDeviceSetting(other, 'small_note'), 'kept');

  // A file that does carry a phone setting (made by hand, say) cannot plant it.
  const planted = { ...backup, tables: { ...backup.tables, settings: [{ key: DEVICE_KEYS.appLock, value: '' }] } };
  await restoreBackup(other, planted);
  assert.equal(await getDeviceSetting(other, DEVICE_KEYS.appLock), '1');
});

test('automatic backup settings read back as one object', async () => {
  const { db } = await createTestDatabase();
  assert.deepEqual(await getAutoBackupSettings(db), { on: false, folder: null, lastAt: null, error: null });
  await setDeviceSetting(db, DEVICE_KEYS.autoBackupOn, '1');
  await setDeviceSetting(db, DEVICE_KEYS.autoBackupFolder, 'content://test/folder');
  await setDeviceSetting(db, DEVICE_KEYS.autoBackupLastAt, at(12, 0, 5));
  await setDeviceSetting(db, DEVICE_KEYS.autoBackupError, 'Folder not found');
  assert.deepEqual(await getAutoBackupSettings(db), {
    on: true,
    folder: 'content://test/folder',
    lastAt: at(12, 0, 5),
    error: 'Folder not found',
  });
  // Turning it off clears the value.
  await setDeviceSetting(db, DEVICE_KEYS.autoBackupOn, '');
  assert.equal((await getAutoBackupSettings(db)).on, false);
});
