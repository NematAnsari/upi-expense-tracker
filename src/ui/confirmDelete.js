import { Alert } from 'react-native';
import { activityTitle } from '../domain/loans';
import { formatDateTime } from '../utils/dates';
import { formatINR } from '../utils/money';

/** Asks before deleting. Resolves true only if the user taps Delete. */
export function confirmDeleteTransaction(transaction) {
  // "Paid to XYZ Store · ₹500.00", "Gave money to Amit · ₹2,000.00"...
  const title = activityTitle(transaction);
  const purpose = transaction.merchant && transaction.purpose ? `\n${transaction.purpose}` : '';
  return new Promise((resolve) => {
    Alert.alert(
      'Delete this transaction?',
      `${title} · ${formatINR(transaction.amountPaise)}${purpose}\n${formatDateTime(transaction.occurredAt)}\n\nThis cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
