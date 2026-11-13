import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { Alert } from 'react-native';
import { checkPeopleChange } from '../db/people';
import { checkShopChange } from '../db/shopAccounts';
import { listSplitParts } from '../db/splitPayments';
import { deleteTransactions } from '../db/transactions';
import { activityTitle } from '../domain/entryTypes';
import { formatDateTime } from '../utils/dates';
import { formatINR } from '../utils/money';
import { askChoice, showError, showMessage } from '../utils/notify';

/** Why these entries cannot be deleted (money back or a shop would go wrong), or null. */
async function whyNotDelete(db, ids) {
  return (await checkPeopleChange(db, { removeIds: ids })) ?? (await checkShopChange(db, { removeIds: ids }));
}

/** "Delete this transaction?" Resolves 'one', or null when cancelled. */
function confirmDelete(transaction) {
  const purpose = transaction.merchant && transaction.purpose ? `\n${transaction.purpose}` : '';
  return askChoice(
    'Delete this transaction?',
    `${activityTitle(transaction)} · ${formatINR(transaction.amountPaise)}${purpose}\n${formatDateTime(transaction.occurredAt)}\n\nThis cannot be undone.`,
    [
      { text: 'Cancel', value: null, style: 'cancel' },
      { text: 'Delete', value: 'one', style: 'destructive' },
    ],
  );
}

/** For one part of a split: delete only it, or all parts. Resolves 'one', 'all' or null. */
function confirmDeleteSplitPart(transaction, parts) {
  const totalPaise = parts.reduce((sum, part) => sum + part.amountPaise, 0);
  return askChoice(
    'Delete part of a split payment?',
    `${activityTitle(transaction)} · ${formatINR(transaction.amountPaise)}\nThis is one of ${parts.length} parts of a split payment (${formatINR(totalPaise)} in all).\n\nThis cannot be undone.`,
    [
      { text: 'Cancel', value: null, style: 'cancel' },
      { text: 'Only this one', value: 'one' },
      { text: `All ${parts.length} parts`, value: 'all', style: 'destructive' },
    ],
  );
}

/**
 * Returns deleteWithConfirm(transaction), used by every list and the edit
 * screen: asks first, deletes, then calls onDeleted (usually a reload).
 * A split asks whether to delete all its parts. A delete that would leave
 * money back too large, or a shop with more paid than taken, is refused.
 */
export function useDeleteTransaction(onDeleted) {
  const db = useSQLiteContext();
  return useCallback(
    async (transaction) => {
      try {
        const parts = transaction.splitGroup != null ? await listSplitParts(db, transaction.splitGroup) : [];
        const isSplit = parts.length > 1;
        // For a single entry the reason is shown before asking, so you are not asked for nothing.
        const earlyReason = isSplit ? null : await whyNotDelete(db, [transaction.id]);
        if (earlyReason) {
          Alert.alert('Cannot delete', earlyReason);
          return;
        }
        const choice = isSplit ? await confirmDeleteSplitPart(transaction, parts) : await confirmDelete(transaction);
        if (!choice) {
          return;
        }
        const ids = choice === 'all' ? parts.map((part) => part.id) : [transaction.id];
        const reason = isSplit ? await whyNotDelete(db, ids) : null;
        if (reason) {
          Alert.alert('Cannot delete', reason);
          return;
        }
        await deleteTransactions(db, ids);
        showMessage(ids.length > 1 ? `${ids.length} entries deleted` : 'Transaction deleted');
        onDeleted?.();
      } catch (error) {
        showError('Could not delete', error);
      }
    },
    [db, onDeleted],
  );
}
