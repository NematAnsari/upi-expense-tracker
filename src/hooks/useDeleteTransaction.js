import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { Alert } from 'react-native';
import { checkLoanChange } from '../db/reports';
import { checkShopChange } from '../db/shopAccounts';
import { deleteTransactions, listSplitParts } from '../db/transactions';
import { confirmDeleteSplitPart, confirmDeleteTransaction } from '../ui/confirmDelete';
import { showMessage } from '../ui/notify';

/** Why these entries cannot be deleted, or null when they can. */
async function checkRemoval(db, ids) {
  return (await checkLoanChange(db, { removeIds: ids })) ?? (await checkShopChange(db, { removeIds: ids }));
}

/**
 * Returns deleteWithConfirm(transaction): asks first, deletes, shows a message,
 * then calls onDeleted (usually the screen's reload). Shared by every list
 * that lets you swipe or long-press a row to delete it, and by the edit screen.
 *
 * Three things can change what happens:
 * - The entry is part of a split payment: you choose to delete only it or all parts.
 * - Deleting money given or taken would leave money received back or returned
 *   larger than there was to receive or return: it is refused with the reason.
 * - Deleting something taken at a shop would leave more paid than taken: refused too.
 */
export function useDeleteTransaction(onDeleted) {
  const db = useSQLiteContext();
  return useCallback(
    async (transaction) => {
      try {
        const parts = transaction.splitGroup != null ? await listSplitParts(db, transaction.splitGroup) : [];
        const isSplit = parts.length > 1;

        // A refusal is shown before asking, so you are not asked about something that cannot happen.
        if (!isSplit) {
          const refused = await checkRemoval(db, [transaction.id]);
          if (refused) {
            Alert.alert('Cannot delete', refused);
            return;
          }
        }

        const choice = isSplit
          ? await confirmDeleteSplitPart(transaction, parts)
          : (await confirmDeleteTransaction(transaction))
            ? 'one'
            : null;
        if (!choice) {
          return;
        }

        const ids = choice === 'all' ? parts.map((part) => part.id) : [transaction.id];
        if (isSplit) {
          const refused = await checkRemoval(db, ids);
          if (refused) {
            Alert.alert('Cannot delete', refused);
            return;
          }
        }

        await deleteTransactions(db, ids);
        showMessage(ids.length > 1 ? `${ids.length} entries deleted` : 'Transaction deleted');
        onDeleted?.();
      } catch (error) {
        console.error(error);
        Alert.alert('Could not delete', error.message || 'Please try again.');
      }
    },
    [db, onDeleted],
  );
}
