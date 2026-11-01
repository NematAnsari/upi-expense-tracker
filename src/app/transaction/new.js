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
import { INCOME } from '../../domain/categorize';
import { isValidLoanType, LOAN_TYPES } from '../../domain/loans';
import { applyTemplate, createEmptyTransactionForm } from '../../domain/transactionForm';
import { checkReturnAmount, getLoanBalances } from '../../db/reports';
import { formatINR, paiseToInputString } from '../../utils/money';
import { showMessage } from '../../ui/notify';

// Giving or taking money starts a record with a person (returns come later).
const STARTS_WITH_PERSON = ['lent', 'borrowed'];

export default function NewTransactionScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  // templateId: opened from a Quick add template ("/transaction/new?templateId=3").
  // detectedId: opened with "Edit" from Review Payments (loanType: what was chosen on the card).
  // loanType, person, amountPaise: opened from the Loans screens to add or repay a loan.
  // direction: 'credit' opens the form for income (Home's "Add income").
  const { templateId, detectedId, loanType, person, amountPaise, direction } = useLocalSearchParams();
  const [state, setState] = useState({ data: null, error: null });
  const [attempt, setAttempt] = useState(0);

  // Loaded once when the screen opens (not on every focus): the form keeps its own
  // state from here on, and the default time should not change while typing.
  const loadFormData = useCallback(async () => {
    const [categories, templates, accounts, lastPaymentMethod, template, balances] = await Promise.all([
      listCategories(db),
      listTemplates(db),
      listAccounts(db),
      getLastPaymentMethod(db),
      templateId ? getTemplate(db, Number(templateId)) : null,
      getLoanBalances(db),
    ]);
    // Names already used for money given and taken, for "Same person as ...?".
    const people = balances.people.map((candidate) => candidate.person);
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
        loanType: isValidLoanType(loanType || null, detected.direction) ? loanType || null : null,
        accountId: detected.accountId,
        categoryId: detected.suggestedCategoryId,
        occurredAt: detected.postedAt,
        paymentMethod: 'UPI',
        merchant: detected.counterparty ?? '',
        reference: detected.reference ?? '',
      };
      // Templates would overwrite the detected amount, so they are hidden here.
      return { categories, templates: undefined, accounts, people, initialValues };
    }

    if (template) {
      initialValues = applyTemplate(initialValues, template);
      await markTemplateUsed(db, template.id);
    }
    if (direction === 'credit' && !template) {
      const income = categories.find((category) => category.name === INCOME);
      initialValues = { ...initialValues, direction: 'credit', categoryId: income?.id ?? null };
    }
    // Opened from the Loans screens: start with that loan type (and its Paid/Received side),
    // and the person's name and amount when given.
    if (loanType && LOAN_TYPES[loanType]) {
      initialValues = { ...initialValues, loanType, direction: LOAN_TYPES[loanType].direction };
      if (person) {
        initialValues.merchant = person;
      }
      if (Number(amountPaise) > 0) {
        initialValues.amountText = paiseToInputString(Number(amountPaise));
      }
    }
    return { categories, templates, accounts, people, initialValues };
  }, [db, templateId, detectedId, loanType, person, amountPaise, direction]);

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
    showMessage(values.loanType ? 'Saved' : values.direction === 'credit' ? 'Income saved' : 'Expense saved');
    // New money given or taken opens the person's page, so you see the remaining
    // amount straight away. From a person's page, going back shows it already.
    if (STARTS_WITH_PERSON.includes(values.loanType) && !detectedId && !person) {
      router.replace({ pathname: '/loan/[person]', params: { person: values.merchant } });
    } else {
      router.back();
    }
  }

  // Money received back or returned always belongs to the person it was opened for.
  const lockPerson = Boolean(person) && Boolean(loanType) && !STARTS_WITH_PERSON.includes(loanType);

  async function checkBeforeSave(values) {
    const message = await checkReturnAmount(db, values);
    return message ? { amount: message } : null;
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
      knownPeople={state.data.people}
      initialValues={state.data.initialValues}
      submitLabel="Save"
      onSubmit={handleSubmit}
      lockPerson={lockPerson}
      amountHint={lockPerson && Number(amountPaise) > 0 ? `Remaining amount: ${formatINR(Number(amountPaise))}` : null}
      checkBeforeSave={checkBeforeSave}
    />
  );
}
