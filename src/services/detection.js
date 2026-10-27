// Connects the native notification queue to the database. Kept out of
// src/db/ because it depends on the Android-only native module.

import * as listener from '../../modules/upi-notification-listener';
import { syncCapturedNotifications } from '../db/detected';

export const detectionAvailable = listener.isAvailable;

/**
 * Moves newly captured notifications into the database. Never throws:
 * detection is optional, so a problem here must not break the screen.
 */
export async function syncDetectedPayments(db) {
  if (!listener.isAvailable) {
    return 0;
  }
  try {
    return await syncCapturedNotifications(db, listener);
  } catch (error) {
    console.error('Payment detection sync failed', error);
    return 0;
  }
}
