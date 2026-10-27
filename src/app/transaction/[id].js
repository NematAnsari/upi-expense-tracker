import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { Alert } from 'react-native';
import { TransactionForm } from '../../components/TransactionForm';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { listAccounts } from '../../db/accounts';
import { listCategories } from '../../db/categories';
import { deleteTransaction, getTransaction, updateTransaction } from '../../db/transactions';
import { useFocusQuery } from '../../hooks/useFocusQuery';
import { confirmDeleteTransaction } from '../../ui/confirmDelete';
import { paiseToInputString } from '../../utils/money';
import { showMessage } from '../../ui/notify';

export default function EditTransactionScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  // Route params always arrive as strings ("/transaction/12" gives id "12").
  const { id } = useLocalSearchParams();
  const transactionId = Number(id);

  const loader = useCallback(async () => {
    const [transaction, categories, accounts] = await Promise.all([
      getTransaction(db, transactionId),
      listCategories(db),
      listAccounts(db),
    ]);
    return { transaction, categories, accounts };
  }, [db, transactionId]);
  const { data, error, reload } = useFocusQuery(loader);

  async function handleSubmit(values) {
    await updateTransaction(db, transactionId, values);
    showMessage('Changes saved');
    router.back();
  }

  async function handleDelete() {
    if (!(await confirmDeleteTransaction(data.transaction))) {
      return;
    }
    try {
      await deleteTransaction(db, transactionId);
      showMessage('Transaction deleted');
      router.back();
    } catch (deleteError) {
      console.error(deleteError);
      Alert.alert('Could not delete', deleteError.message || 'Please try again.');
    }
  }

  if (error) {
    return <ErrorState onRetry={reload} />;
  }
  if (!data) {
    return <LoadingState />;
  }
  if (!data.transaction) {
    return (
      <EmptyState
        title="Transaction not found"
        message="It may have been deleted."
        actionLabel="Go back"
        onAction={() => router.back()}
      />
    );
  }

  const { transaction, categories, accounts } = data;
  return (
    <TransactionForm
      // Remount the form if a different transaction loads, so it shows fresh values.
      key={transaction.id}
      categories={categories}
      accounts={accounts}
      initialValues={{
        amountText: paiseToInputString(transaction.amountPaise),
        direction: transaction.direction,
        accountId: transaction.accountId,
        purpose: transaction.purpose ?? '',
        categoryId: transaction.categoryId,
        occurredAt: transaction.occurredAt,
        paymentMethod: transaction.paymentMethod,
        merchant: transaction.merchant ?? '',
        reference: transaction.reference ?? '',
        notes: transaction.notes ?? '',
      }}
      submitLabel="Save changes"
      onSubmit={handleSubmit}
      onDelete={handleDelete}
    />
  );
}
