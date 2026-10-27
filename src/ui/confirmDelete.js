import { Alert } from 'react-native';
import { formatDateTime } from '../utils/dates';
import { formatINR } from '../utils/money';

/** Asks before deleting. Resolves true only if the user taps Delete. */
export function confirmDeleteTransaction(transaction) {
  const label = transaction.purpose || transaction.merchant || transaction.categoryName;
  const kind = transaction.direction === 'credit' ? 'Received' : 'Paid';
  return new Promise((resolve) => {
    Alert.alert(
      'Delete this transaction?',
      `${kind} ${formatINR(transaction.amountPaise)} · ${label}\n${formatDateTime(transaction.occurredAt)}\n\nThis cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
