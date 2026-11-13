// The nightly background run of the automatic backup. Android picks the time
// and may skip it; opening the app catches up. Defined at the top level and
// imported from index.js, as expo-task-manager needs it without any screen.

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
