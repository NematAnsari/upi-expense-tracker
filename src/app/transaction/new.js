import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { TransactionForm } from '../../components/TransactionForm';
import { ErrorState, LoadingState } from '../../components/States';
import { listAccounts } from '../../db/accounts';
import { listCategories } from '../../db/categories';
import { addDetectedAsTransaction, listPendingDetected } from '../../db/detected';
import { getLastPaymentMethod } from '../../db/suggestions';
import { getTemplate, listTemplates, markTemplateUsed } from '../../db/templates';
import { createTransaction } from '../../db/transactions';
import { applyTemplate, createEmptyTransactionForm } from '../../domain/transactionForm';
import { paiseToInputString } from '../../utils/money';
import { showMessage } from '../../ui/notify';

export default function NewTransactionScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  // templateId: opened from a Quick add template ("/transaction/new?templateId=3").
  // detectedId: opened with "Edit" from Review Payments.
  const { templateId, detectedId } = useLocalSearchParams();
  const [state, setState] = useState({ data: null, error: null });
  const [attempt, setAttempt] = useState(0);

  // Loaded once when the screen opens (not on every focus): the form keeps its own
  // state from here on, and the default time should not change while typing.
  const loadFormData = useCallback(async () => {
    const [categories, templates, accounts, lastPaymentMethod, template] = await Promise.all([
      listCategories(db),
      listTemplates(db),
      listAccounts(db),
      getLastPaymentMethod(db),
      templateId ? getTemplate(db, Number(templateId)) : null,
    ]);
    let initialValues = createEmptyTransactionForm(lastPaymentMethod);

    if (detectedId) {
      const pending = await listPendingDetected(db, categories);
      const detected = pending.find((item) => item.id === Number(detectedId));
      if (!detected) {
        throw new Error('This payment was already added or ignored.');
      }
      initialValues = {
        ...initialValues,
        amountText: paiseToInputString(detected.amountPaise),
        direction: detected.direction,
        accountId: detected.accountId,
        categoryId: detected.suggestedCategoryId,
        occurredAt: detected.postedAt,
        paymentMethod: 'UPI',
        merchant: detected.counterparty ?? '',
        reference: detected.reference ?? '',
      };
      // Templates would overwrite the detected amount, so they are hidden here.
      return { categories, templates: undefined, accounts, initialValues };
    }

    if (template) {
      initialValues = applyTemplate(initialValues, template);
      await markTemplateUsed(db, template.id);
    }
    return { categories, templates, accounts, initialValues };
  }, [db, templateId, detectedId]);

  useEffect(() => {
    let active = true;
    loadFormData()
      .then((data) => active && setState({ data, error: null }))
      .catch((error) => {
        console.error(error);
        if (active) {
          setState({ data: null, error });
        }
      });
    return () => {
      active = false;
    };
  }, [loadFormData, attempt]);

  function retry() {
    setState({ data: null, error: null });
    setAttempt((count) => count + 1);
  }

  async function handleSubmit(values) {
    if (detectedId) {
      await addDetectedAsTransaction(db, Number(detectedId), values);
    } else {
      await createTransaction(db, values);
    }
    showMessage(values.direction === 'credit' ? 'Income saved' : 'Expense saved');
    router.back();
  }

  if (state.error) {
    return <ErrorState message={state.error.message} onRetry={retry} />;
  }
  if (!state.data) {
    return <LoadingState />;
  }
  return (
    <TransactionForm
      categories={state.data.categories}
      templates={state.data.templates}
      accounts={state.data.accounts}
      initialValues={state.data.initialValues}
      submitLabel="Save"
      onSubmit={handleSubmit}
    />
  );
}
