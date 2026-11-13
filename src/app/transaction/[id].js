import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { EmptyState, ErrorState, LoadingState } from '../../components/basics/ScreenStates';
import { TransactionForm } from '../../components/form/TransactionForm';
import { listAccounts } from '../../db/accounts';
import { listCategories } from '../../db/categories';
import { rememberEditedName } from '../../db/nameMemory';
import { checkPeopleChange, checkReturnAmount, listPeopleNames } from '../../db/people';
import { checkShopChange, checkShopPayment } from '../../db/shopAccounts';
import { updateSplitShared } from '../../db/splitPayments';
import { getTransaction, updateTransaction } from '../../db/transactions';
import { useDeleteTransaction } from '../../hooks/useDeleteTransaction';
import { useFocusQuery } from '../../hooks/useFocusQuery';
import { paiseToInputString } from '../../utils/money';
import { showMessage } from '../../utils/notify';

export default function EditTransactionScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  // Route params always arrive as strings ("/transaction/12" gives id "12").
  const { id } = useLocalSearchParams();
  const transactionId = Number(id);

  const loader = useCallback(async () => {
    const [transaction, categories, accounts, knownPeople] = await Promise.all([
      getTransaction(db, transactionId),
      listCategories(db),
      listAccounts(db),
      listPeopleNames(db),
    ]);
    return { transaction, categories, accounts, knownPeople };
  }, [db, transactionId]);
  const { data, error, reload } = useFocusQuery(loader);
  const deleteWithConfirm = useDeleteTransaction(() => router.back());

  // The entry's own old amount is left out, so it can be edited within what is left.
  async function checkBeforeSave(values) {
    if (data.transaction.shopEntry === 'payment' && data.transaction.shopAccountId != null) {
      const tooMuch = await checkShopPayment(db, data.transaction.shopAccountId, values.amountPaise, transactionId);
      return tooMuch ? { amount: tooMuch } : null;
    }
    const tooMuch = await checkReturnAmount(db, values, transactionId);
    if (tooMuch) {
      return { amount: tooMuch };
    }
    // Other changes (lower amount, new type, name or date) must not leave money back or a shop wrong.
    const change = { edit: { id: transactionId, values } };
    const refused = (await checkPeopleChange(db, change)) ?? (await checkShopChange(db, change));
    return refused ? { amount: refused } : null;
  }

  async function handleSubmit(values) {
    await updateTransaction(db, transactionId, values);
    // A split is one payment: its date, method, bank account and reference follow on every part.
    if (data.transaction.splitGroup != null) {
      await updateSplitShared(db, data.transaction.splitGroup, transactionId, values);
    }
    // A fix to a bank payment's name is remembered; the form does not edit shop fields, so they are added.
    const valuesWithShop = {
      ...values,
      shopEntry: data.transaction.shopEntry,
      shopAccountId: data.transaction.shopAccountId,
    };
    // Only a helper: a failure here must not lose the saved change.
    await rememberEditedName(db, transactionId, valuesWithShop).catch((memoryError) => console.error(memoryError));
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

  const { transaction, categories, accounts, knownPeople } = data;
  return (
    <TransactionForm
      // Remount the form if a different transaction loads, so it shows fresh values.
      key={transaction.id}
      categories={categories}
      accounts={accounts}
      knownPeople={knownPeople}
      initialValues={{
        amountText: paiseToInputString(transaction.amountPaise),
        direction: transaction.direction,
        loanType: transaction.loanType,
        dueAt: transaction.dueAt,
        // Shop entries keep their account; the form only needs to know which kind it is.
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
