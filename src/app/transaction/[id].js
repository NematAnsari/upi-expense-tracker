import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { TransactionForm } from '../../components/TransactionForm';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { listAccounts } from '../../db/accounts';
import { listCategories } from '../../db/categories';
import { rememberEditedName } from '../../db/detected';
import { checkShopChange, checkShopPayment } from '../../db/shopAccounts';
import { checkLoanChange, checkReturnAmount, getLoanBalances } from '../../db/reports';
import { getTransaction, updateSplitShared, updateTransaction } from '../../db/transactions';
import { useDeleteTransaction } from '../../hooks/useDeleteTransaction';
import { useFocusQuery } from '../../hooks/useFocusQuery';
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
  // The same delete as in the lists: asks first, handles split payments, and refuses
  // a delete that would leave money received back or returned too large.
  const deleteWithConfirm = useDeleteTransaction(() => router.back());

  // The entry's own old amount is left out, so it can be edited within the remaining amount.
  async function checkBeforeSave(values) {
    // A shop payment cannot be more than what is due there (its own old amount left out).
    if (data.transaction.shopEntry === 'payment' && data.transaction.shopAccountId != null) {
      const tooMuch = await checkShopPayment(db, data.transaction.shopAccountId, values.amountPaise, transactionId);
      return tooMuch ? { amount: tooMuch } : null;
    }
    const message = await checkReturnAmount(db, values, transactionId);
    if (message) {
      return { amount: message };
    }
    // Lowering money given or taken, changing its type or name, or moving an
    // entry in time must not leave money received back or returned too large.
    // The same for a shop account: lowering something taken must not leave more paid than taken.
    const change = { edit: { id: transactionId, values } };
    const refused = (await checkLoanChange(db, change)) ?? (await checkShopChange(db, change));
    return refused ? { amount: refused } : null;
  }

  async function handleSubmit(values) {
    await updateTransaction(db, transactionId, values);
    // A split is one payment: its date, method, bank account and reference follow on every part.
    if (data.transaction.splitGroup != null) {
      await updateSplitShared(db, data.transaction.splitGroup, transactionId, values);
    }
    // A fix to a bank payment's name or category is remembered for next time.
    // Only a helper: a failure here must not lose the saved change.
    // The form does not change shop fields, so they are passed along for the memory.
    const remembered = {
      ...values,
      shopEntry: data.transaction.shopEntry,
      shopAccountId: data.transaction.shopAccountId,
    };
    await rememberEditedName(db, transactionId, remembered).catch((memoryError) => console.error(memoryError));
    showMessage('Changes saved');
    router.back();
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
        dueAt: transaction.dueAt,
        // Shop account entries keep their account; the form only needs to know a payment.
        shopEntry: transaction.shopEntry,
        shopName: transaction.shopName,
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
      onDelete={() => deleteWithConfirm(transaction)}
      mode="edit"
      checkBeforeSave={checkBeforeSave}
    />
  );
}
