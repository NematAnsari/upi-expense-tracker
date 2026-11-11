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

/**
 * Asks before deleting one part of a split payment: only this one, or all
 * parts (your share and what was paid for others). Resolves 'one', 'all' or
 * null when cancelled. parts: from listSplitParts.
 */
export function confirmDeleteSplitPart(transaction, parts) {
  const title = activityTitle(transaction);
  const totalPaise = parts.reduce((sum, part) => sum + part.amountPaise, 0);
  return new Promise((resolve) => {
    Alert.alert(
      'Delete part of a split payment?',
      `${title} · ${formatINR(transaction.amountPaise)}\nThis is one of ${parts.length} parts of a split payment (${formatINR(totalPaise)} in all).\n\nThis cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
        { text: 'Only this one', onPress: () => resolve('one') },
        { text: `All ${parts.length} parts`, style: 'destructive', onPress: () => resolve('all') },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}
