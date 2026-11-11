// Connects the native notification queue to the database. Kept out of
// src/db/ because it depends on the Android-only native module.

import * as listener from '../../modules/upi-notification-listener';
import { getLastDetectedAt, syncCapturedNotifications } from '../db/detected';
import { daysBetween } from '../utils/dates';

// With no bank message for this many days, detection may have stopped.
const QUIET_DAYS = 3;

/**
 * Makes sure the notification reader is connected, then moves newly captured
 * notifications into the database. Never throws: detection is optional, so a
 * problem here must not break the screen.
 */
export async function syncDetectedPayments(db) {
  if (!listener.isAvailable) {
    return 0;
  }
  listener.reconnectListener();
  try {
    return await syncCapturedNotifications(db, listener);
  } catch (error) {
    console.error('Payment detection sync failed', error);
    return 0;
  }
}

/**
 * How many days since the last bank message was read, when that is long
 * enough to suspect detection stopped (Android can stop the reader to save
 * battery). null when detection is not set up, nothing was ever read, or a
 * message came recently.
 */
export async function getQuietDays(db, now = Date.now()) {
  if (!listener.isAvailable || !listener.isPermissionGranted()) {
    return null;
  }
  const lastAt = await getLastDetectedAt(db);
  if (lastAt == null) {
    return null;
  }
  const days = daysBetween(lastAt, now);
  return days >= QUIET_DAYS ? days : null;
}
