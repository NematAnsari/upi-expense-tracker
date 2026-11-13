// The background side of the automatic backup. Android decides when
// background work runs (usually at night, while the phone is idle or
// charging), so this cannot promise an exact time, and a phone maker's battery
// saver can skip it. Opening the app catches up (see AutoBackupOnOpen).
//
// The task is defined here at the top level, as expo-task-manager requires:
// when Android starts the app only to run the task, no screen is loaded, so
// this file is imported from the app's entry file (index.js).

import * as BackgroundTask from 'expo-background-task';
import * as SQLite from 'expo-sqlite';
import * as TaskManager from 'expo-task-manager';
import { DATABASE_NAME, LATEST_VERSION } from '../db/migrations';
import { runAutoBackupIfDue } from './autoBackup';

const TASK_NAME = 'daily-auto-backup';
// Ask for a run about once a day. Android treats this as "not sooner than".
const EVERY_MINUTES = 24 * 60;

TaskManager.defineTask(TASK_NAME, async () => {
  let db = null;
  try {
    // Its own connection, so closing it here never touches the one the open app uses.
    db = await SQLite.openDatabaseAsync(DATABASE_NAME, { useNewConnection: true });
    // After an app update the database is upgraded when the app is next
    // opened. Until then, leave it alone: the backup runs on that open.
    const version = await db.getFirstAsync('PRAGMA user_version');
    if ((version?.user_version ?? 0) !== LATEST_VERSION) {
      return BackgroundTask.BackgroundTaskResult.Success;
    }
    const result = await runAutoBackupIfDue(db);
    return result === 'failed'
      ? BackgroundTask.BackgroundTaskResult.Failed
      : BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    console.error('Automatic backup task failed', error);
    return BackgroundTask.BackgroundTaskResult.Failed;
  } finally {
    await db?.closeAsync().catch(() => {});
  }
});

/**
 * Turns the nightly run on or off to match the switch. Safe to call on
 * every app start. Returns false when background work is not available on
 * this phone (the backup then only runs when you open the app).
 */
export async function syncAutoBackupTask(on) {
  try {
    const registered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
    if (on && !registered) {
      await BackgroundTask.registerTaskAsync(TASK_NAME, { minimumInterval: EVERY_MINUTES });
    } else if (!on && registered) {
      await BackgroundTask.unregisterTaskAsync(TASK_NAME);
    }
    return true;
  } catch (error) {
    console.warn('Could not set up the nightly backup', error);
    return false;
  }
}
