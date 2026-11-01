import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { Alert } from 'react-native';
import { deleteTransaction } from '../db/transactions';
import { confirmDeleteTransaction } from '../ui/confirmDelete';
import { showMessage } from '../ui/notify';

/**
 * Returns deleteWithConfirm(transaction): asks first, deletes, shows a message,
 * then calls onDeleted (usually the screen's reload). Shared by every list
 * that lets you swipe or long-press a row to delete it.
 */
export function useDeleteTransaction(onDeleted) {
  const db = useSQLiteContext();
  return useCallback(
    async (transaction) => {
      if (!(await confirmDeleteTransaction(transaction))) {
        return;
      }
      try {
        await deleteTransaction(db, transaction.id);
        showMessage('Transaction deleted');
        onDeleted?.();
      } catch (error) {
        console.error(error);
        Alert.alert('Could not delete', error.message || 'Please try again.');
      }
    },
    [db, onDeleted],
  );
}
