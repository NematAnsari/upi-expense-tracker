import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { Alert } from 'react-native';
import { TransactionForm } from '../../components/TransactionForm';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { listAccounts } from '../../db/accounts';
import { listCategories } from '../../db/categories';
import { checkReturnAmount, getLoanBalances } from '../../db/reports';
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
    const [transaction, categories, accounts, balances] = await Promise.all([
      getTransaction(db, transactionId),
      listCategories(db),
      listAccounts(db),
      getLoanBalances(db),
    ]);
    return { transaction, categories, accounts, people: balances.people.map((candidate) => candidate.person) };
  }, [db, transactionId]);
  const { data, error, reload } = useFocusQuery(loader);

  // The entry's own old amount is left out, so it can be edited within the remaining amount.
  async function checkBeforeSave(values) {
    const message = await checkReturnAmount(db, values, transactionId);
    return message ? { amount: message } : null;
  }

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

  const { transaction, categories, accounts, people } = data;
  return (
    <TransactionForm
      // Remount the form if a different transaction loads, so it shows fresh values.
      key={transaction.id}
      categories={categories}
      accounts={accounts}
      knownPeople={people}
      initialValues={{
        amountText: paiseToInputString(transaction.amountPaise),
        direction: transaction.direction,
        loanType: transaction.loanType,
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
      checkBeforeSave={checkBeforeSave}
    />
  );
}
