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

export function sourceAppName(packageName) {
  if (!packageName) {
    return null;
  }
  if (SMS_APPS.includes(packageName)) {
    return 'SMS';
  }
  return UPI_APPS[packageName] ?? 'App notification';
}
