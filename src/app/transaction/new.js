import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { ErrorState, LoadingState } from '../../components/basics/ScreenStates';
import { TransactionForm } from '../../components/form/TransactionForm';
import { INCOME } from '../../constants/categories';
import { listAccounts } from '../../db/accounts';
import { listCategories } from '../../db/categories';
import { addDetectedAsTransaction, getPendingDetected } from '../../db/detected';
import { checkReturnAmount, listPeopleNames } from '../../db/people';
import { createSplitPayment } from '../../db/splitPayments';
import { getLastPaymentMethod } from '../../db/suggestions';
import { getTemplate, listTemplates, markTemplateUsed } from '../../db/templates';
import { createTransaction } from '../../db/transactions';
import { isValidLoanType, LOAN_TYPES, takesDueDate } from '../../domain/entryTypes';
import { applyTemplate, emptyTransactionForm } from '../../domain/transactionForm';
import { formatINR, paiseToInputString } from '../../utils/money';
import { showMessage } from '../../utils/notify';
import { paymentSourceText } from '../../utils/sourceApps';

/** The short message after saving. */
function savedMessage(values, split) {
  if (split) {
    return 'Split saved';
  }
  if (values.loanType) {
    return 'Saved';
  }
  return values.direction === 'credit' ? 'Income saved' : 'Expense saved';
}

export default function NewTransactionScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  // templateId: opened from a Quick add template ("/transaction/new?templateId=3").
  // detectedId: opened with "Edit" from Review Payments (loanType: what was chosen on the card).
  // loanType, person, amountPaise: opened from the Given & Taken tab or a person page.
  // direction: 'credit' opens the form for income (Home's "Add income").
  const { templateId, detectedId, loanType, person, amountPaise, direction } = useLocalSearchParams();
  const [state, setState] = useState({ data: null, error: null });
  const [attempt, setAttempt] = useState(0);

  // Loaded once when the screen opens (not on every focus): the form keeps its own
  // state from here on, and the default time should not change while typing.
  const loadFormData = useCallback(async () => {
    const [categories, templates, accounts, lastPaymentMethod, template, knownPeople] = await Promise.all([
      listCategories(db),
      // Templates would overwrite a bank payment's amount, so they are hidden for one.
      detectedId ? undefined : listTemplates(db),
      listAccounts(db),
      getLastPaymentMethod(db),
      templateId ? getTemplate(db, Number(templateId)) : null,
      listPeopleNames(db),
    ]);
    let initialValues = emptyTransactionForm(lastPaymentMethod);

    if (detectedId) {
      const detected = await getPendingDetected(db, Number(detectedId), categories);
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
        sourceText: paymentSourceText(detected.sourcePackage, detected.accountBank),
      };
      return { categories, templates, accounts, knownPeople, initialValues };
    }

    if (template) {
      initialValues = applyTemplate(initialValues, template);
      await markTemplateUsed(db, template.id);
    }
    if (direction === 'credit' && !template) {
      const income = categories.find((category) => category.name === INCOME);
      initialValues = { ...initialValues, direction: 'credit', categoryId: income?.id ?? null };
    }
    // Opened from the Given & Taken tab or a person page: start with that type
    // (and its Paid/Received side), and the person's name and amount when given.
    if (loanType && LOAN_TYPES[loanType]) {
      initialValues = { ...initialValues, loanType, direction: LOAN_TYPES[loanType].direction };
      if (person) {
        initialValues.merchant = person;
      }
      if (Number(amountPaise) > 0) {
        initialValues.amountText = paiseToInputString(Number(amountPaise));
      }
    }
    return { categories, templates, accounts, knownPeople, initialValues };
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

  // split: { parts, loansCategoryId } when the expense was split with other people.
  async function handleSubmit(values, split) {
    if (detectedId) {
      await addDetectedAsTransaction(db, Number(detectedId), values, split);
    } else if (split) {
      await createSplitPayment(db, values, split.parts, split.loansCategoryId);
    } else {
      await createTransaction(db, values);
    }
    showMessage(savedMessage(values, split));
    // New money given or taken opens the person's page, so you see the remaining
    // amount straight away. From a person's page, going back shows it already.
    if (takesDueDate(values.loanType) && !detectedId && !person) {
      router.replace({ pathname: '/person/[name]', params: { name: values.merchant } });
    } else {
      router.back();
    }
  }

  // Money received back or returned always belongs to the person it was opened for.
  const lockPerson = Boolean(person) && Boolean(loanType) && !takesDueDate(loanType);

  async function checkBeforeSave(values) {
    const tooMuch = await checkReturnAmount(db, values);
    return tooMuch ? { amount: tooMuch } : null;
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
      knownPeople={state.data.knownPeople}
      initialValues={state.data.initialValues}
      submitLabel="Save"
      onSubmit={handleSubmit}
      lockPerson={lockPerson}
      amountHint={lockPerson && Number(amountPaise) > 0 ? `Remaining amount: ${formatINR(Number(amountPaise))}` : null}
      checkBeforeSave={checkBeforeSave}
      lockType={Boolean(detectedId)}
      allowSplit
    />
  );
}
