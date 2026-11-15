// Friendly names for the apps payment notifications come from.

const SMS_APPS = [
  'com.google.android.apps.messaging',
  'com.android.mms',
  'com.oneplus.mms',
  'com.samsung.android.messaging',
];

const UPI_APPS = {
  'com.google.android.apps.nbu.paisa.user': 'Google Pay',
  'com.phonepe.app': 'PhonePe',
  'net.one97.paytm': 'Paytm',
  'in.org.npci.upiapp': 'BHIM',
  'in.amazon.mShop.android.shopping': 'Amazon Pay',
};

/**
 * The Source an entry gets from a detected payment: the app the notification
 * came from and the bank, "SMS · Kotak Mahindra Bank" or "Google Pay".
 */
export function paymentSourceText(packageName, bankName) {
  return [sourceAppName(packageName) ?? 'Notification', bankName].filter(Boolean).join(' · ');
}

export function sourceAppName(packageName) {
  if (!packageName) {
    return null;
  }
  if (SMS_APPS.includes(packageName)) {
    return 'SMS';
  }
  return UPI_APPS[packageName] ?? 'App notification';
}
