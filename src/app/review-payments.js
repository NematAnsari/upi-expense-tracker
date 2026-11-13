// Review Payments: payments found in bank SMS and UPI app notifications,
// waiting for you to Add or Ignore. Grouped by day. Every Add or Ignore can be
// undone for a few seconds.

import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Button } from '../components/basics/Button';
import { EmptyState, ErrorState, LoadingState } from '../components/basics/ScreenStates';
import { UndoBar } from '../components/basics/UndoBar';
import { DetectedPaymentCard } from '../components/sections/DetectedPaymentCard';
import { colors, fontSize, spacing } from '../constants/theme';
import { createCategory, listCategories } from '../db/categories';
import {
  addDetectedAsTransaction,
  addDetectedBatch,
  ignoreDetected,
  listPendingDetected,
  unignoreDetected,
  undoAddDetected,
} from '../db/detected';
import { checkReturnAmount, getPeopleBalances } from '../db/people';
import { checkShopPayment, listShopAccounts } from '../db/shopAccounts';
import { loanLabel } from '../domain/entryTypes';
import { suggestReturnType } from '../domain/people';
import { canAddInBatch, loanTypeOf, shopOf, suggestionNote, transactionFor, typeOf } from '../domain/reviewChoices';
import { useFocusQuery } from '../hooks/useFocusQuery';
import { useUndoableAction } from '../hooks/useUndoableAction';
import { syncDetectedPayments } from '../services/detection';
import { formatDayLabel } from '../utils/dates';
import { formatINR } from '../utils/money';
import { showError } from '../utils/notify';
import { plural } from '../utils/text';

// The list scrolls a box you are typing in (a "+ New" name) above the keyboard.
const renderKeyboardAware = (props) => <KeyboardAwareScrollView {...props} bottomOffset={spacing.xl} />;

const Separator = () => <View style={styles.separator} />;

/** [{ title: 'Today', data: [...] }, { title: 'Yesterday', data: [...] }, ...] */
function groupByDay(items) {
  const sections = [];
  for (const item of items) {
    const title = formatDayLabel(item.postedAt);
    const last = sections.at(-1);
    if (last?.title === title) {
      last.data.push(item);
    } else {
      sections.push({ title, data: [item] });
    }
  }
  return sections;
}

export default function ReviewPaymentsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  // Picks made on a card before tapping Add: item id -> loan type or 'shop', category id, shop account id.
  const [typeChoices, setTypeChoices] = useState({});
  const [categoryChoices, setCategoryChoices] = useState({});
  const [shopChoices, setShopChoices] = useState({});
  const choices = { types: typeChoices, categories: categoryChoices, shops: shopChoices };

  const loader = useCallback(async () => {
    await syncDetectedPayments(db);
    const [categories, balances, shopAccounts] = await Promise.all([
      listCategories(db),
      getPeopleBalances(db),
      listShopAccounts(db),
    ]);
    const pending = await listPendingDetected(db, categories);
    // Money from (or to) someone with an open amount is probably money back: suggest it.
    // Possible duplicates hide the choice on their card, so they never get a hidden suggestion.
    const items = pending.map((item) => ({
      ...item,
      suggestion: item.possibleDuplicate ? null : suggestReturnType(item, balances.people),
    }));
    return { categories, items, shopAccounts };
  }, [db]);
  const { data, error, reload } = useFocusQuery(loader);
  const { busy, undoAction, runWithUndo, handleUndo, hideUndo } = useUndoableAction(reload);

  async function handleAdd(item) {
    const values = transactionFor(item, choices, data);
    // Money back cannot be more than what is left, and a shop payment not more than what is due.
    let tooMuch = null;
    try {
      tooMuch = values.shopEntry
        ? await checkShopPayment(db, values.shopAccountId, values.amountPaise)
        : await checkReturnAmount(db, values);
    } catch (checkError) {
      showError('Something went wrong', checkError);
      return;
    }
    if (tooMuch && values.shopEntry) {
      // A shop payment has no Review details: the amount comes from the bank.
      Alert.alert('Check the amount', `${tooMuch}\n\nChoose another option for this payment.`);
      return;
    }
    if (tooMuch) {
      Alert.alert('Check the amount', `${tooMuch}\n\nUse Review details to change it, or choose another option.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Review details', onPress: () => handleEdit(item) },
      ]);
      return;
    }
    const save = () =>
      runWithUndo(
        () => addDetectedAsTransaction(db, item.id, values),
        () => undoAddDetected(db, item.id),
        `Added: ${addedLabel(item, values)}, ${formatINR(item.amountPaise)}`,
      );

    if (item.possibleDuplicate) {
      Alert.alert(
        'Add this anyway?',
        'It looks like the same payment as one already in your list. Adding both will count it twice.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Add anyway', onPress: save },
        ],
      );
    } else {
      save();
    }
  }

  function handleIgnore(item) {
    runWithUndo(
      () => ignoreDetected(db, item.id),
      () => unignoreDetected(db, item.id),
      `Ignored: ${formatINR(item.amountPaise)}`,
    );
  }

  /** "+ New" in a card's category row: saves the category and reloads the list so every card shows it. */
  async function handleCreateCategory(name) {
    const category = await createCategory(db, name);
    reload();
    return category;
  }

  const handleEdit = (item) =>
    router.push({
      pathname: '/transaction/new',
      params: { detectedId: item.id, loanType: loanTypeOf(item, choices, data) ?? '' },
    });

  /** Adds every item that needs no check, with the choices shown on its card. */
  function handleAddAll() {
    const ready = data.items.filter((item) => canAddInBatch(item, choices, data));
    if (ready.length === 0) {
      return;
    }
    const skipped = data.items.length - ready.length;
    Alert.alert(
      `Add ${plural(ready.length, 'payment', 'payments')}?`,
      `They are saved with the categories shown on each card.${
        skipped > 0
          ? ` ${plural(skipped, 'payment needs', 'payments need')} a check first (possible duplicate, missing name, or money received back or returned).`
          : ''
      }`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Add all',
          onPress: () => {
            const added = [];
            runWithUndo(
              async () => {
                const result = await addDetectedBatch(
                  db,
                  ready.map((item) => ({ id: item.id, values: transactionFor(item, choices, data) })),
                );
                added.push(...result.addedIds);
                if (result.error) {
                  throw result.error;
                }
              },
              async () => {
                for (const id of added) {
                  await undoAddDetected(db, id);
                }
              },
              `Added ${plural(ready.length, 'payment', 'payments')}`,
              () => added.length > 0,
            );
          },
        },
      ],
    );
  }

  if (error) {
    return <ErrorState onRetry={reload} />;
  }
  if (!data) {
    return <LoadingState />;
  }

  const duplicateCount = data.items.filter((item) => item.possibleDuplicate).length;
  const addableCount = data.items.filter((item) => canAddInBatch(item, choices, data)).length;

  return (
    <View style={styles.screen}>
      <SectionList
        sections={groupByDay(data.items)}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.content}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        renderScrollComponent={renderKeyboardAware}
        ListHeaderComponent={
          data.items.length > 0 ? (
            <View style={styles.headerBlock}>
              <View style={styles.header}>
                <Text style={styles.summary}>
                  {data.items.length} to review
                  {duplicateCount > 0
                    ? ` · ${plural(duplicateCount, 'possible duplicate', 'possible duplicates')}`
                    : ''}
                </Text>
                <Pressable accessibilityRole="button" onPress={() => router.push('/bank-accounts')} hitSlop={8}>
                  <Text style={styles.link}>Bank accounts</Text>
                </Pressable>
              </View>
              {addableCount > 1 ? (
                <Button label={`Add all ${addableCount}`} variant="secondary" onPress={handleAddAll} disabled={busy} />
              ) : null}
            </View>
          ) : null
        }
        renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
        renderItem={({ item }) => (
          <DetectedPaymentCard
            item={item}
            categories={data.categories}
            categoryId={categoryChoices[item.id] ?? item.suggestedCategoryId}
            onChangeCategory={(id) => setCategoryChoices((current) => ({ ...current, [item.id]: id }))}
            onCreateCategory={handleCreateCategory}
            loanType={typeOf(item, choices, data)}
            shopAccounts={data.shopAccounts}
            shopAccount={shopOf(item, choices, data)}
            onChangeShopAccount={(id) => setShopChoices((current) => ({ ...current, [item.id]: id }))}
            suggestionNote={suggestionNote(item, choices, data)}
            onChangeLoanType={(value) => setTypeChoices((current) => ({ ...current, [item.id]: value }))}
            busy={busy}
            onAdd={() => handleAdd(item)}
            onEdit={() => handleEdit(item)}
            onIgnore={() => handleIgnore(item)}
          />
        )}
        ItemSeparatorComponent={Separator}
        ListEmptyComponent={
          <EmptyState title="All caught up" message="New payments from your bank SMS will appear here." />
        }
      />
      <UndoBar action={undoAction} onUndo={handleUndo} onHide={hideUndo} />
    </View>
  );
}

/** What was added, for the Undo bar: "Payment to Shop", "Gave money", "Income" or "Expense". */
function addedLabel(item, values) {
  if (values.shopEntry) {
    return `Payment to ${values.merchant}`;
  }
  return loanLabel(values.loanType) ?? (item.direction === 'credit' ? 'Income' : 'Expense');
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  // Extra space at the bottom so the Undo bar never covers the last card.
  content: { padding: spacing.lg, paddingBottom: 120 },
  headerBlock: { gap: spacing.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summary: { fontSize: fontSize.sm, color: colors.textMuted },
  link: { fontSize: fontSize.md, color: colors.primary, fontWeight: '600' },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  separator: { height: spacing.md },
});
