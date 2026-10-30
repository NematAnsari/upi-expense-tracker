// JavaScript side of the payment notification listener (Android only).
// In Expo Go the native code is not included, so `isAvailable` is false and the
// app keeps working without detection instead of crashing.

import { requireOptionalNativeModule } from 'expo';

const NativeModule = requireOptionalNativeModule('UpiNotificationListener');

export const isAvailable = NativeModule != null;

/** True when Notification access is switched on for this app. */
export function isPermissionGranted() {
  return isAvailable ? NativeModule.isPermissionGranted() : false;
}

/**
 * Asks Android to reconnect the notification reader. Called whenever the app
 * opens, because Android can disconnect it after an update or to save battery.
 */
export function reconnectListener() {
  if (isAvailable && NativeModule.reconnectListener && isPermissionGranted()) {
    try {
      NativeModule.reconnectListener();
    } catch (error) {
      console.warn('Could not reconnect the notification listener', error);
    }
  }
}

/** True when battery saving will not stop detection in the background. */
export function isBatteryUnrestricted() {
  // Older builds of the app do not have this check yet; assume it is fine.
  return isAvailable && NativeModule.isBatteryUnrestricted ? NativeModule.isBatteryUnrestricted() : true;
}

export function openPermissionSettings() {
  NativeModule?.openPermissionSettings();
}

export function openAppSettings() {
  NativeModule?.openAppSettings();
}

/** Whether the "Payment detected" alert is switched on in the app (on by default). */
export function areRemindersEnabled() {
  return isAvailable && NativeModule.areRemindersEnabled ? NativeModule.areRemindersEnabled() : false;
}

export function setRemindersEnabled(enabled) {
  NativeModule?.setRemindersEnabled?.(enabled);
}

/** Whether Android allows this app to show notifications. */
export function canShowReminders() {
  return isAvailable && NativeModule.canShowReminders ? NativeModule.canShowReminders() : false;
}

/** True when this build of the app supports "Payment detected" alerts. */
export const supportsReminders = isAvailable && typeof NativeModule.areRemindersEnabled === 'function';

/** Captured payment notifications waiting to be processed, oldest first. */
export async function getCapturedNotifications() {
  return isAvailable ? NativeModule.getCapturedNotifications() : [];
}

export async function removeCapturedNotifications(ids) {
  if (isAvailable && ids.length > 0) {
    await NativeModule.removeCapturedNotifications(ids);
  }
}

export async function clearCapturedNotifications() {
  if (isAvailable) {
    await NativeModule.clearCapturedNotifications();
  }
}
