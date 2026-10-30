// Review Payments: payments found in bank SMS and UPI app notifications,
// waiting for you to Add or Ignore. Grouped by day. Every Add or Ignore can be
// undone for a few seconds.

import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { DetectedPaymentCard } from '../components/DetectedPaymentCard';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { UndoBar } from '../components/UndoBar';
import { colors, fontSize, spacing } from '../constants/theme';
import { listCategories } from '../db/categories';
import {
  addDetectedAsTransaction,
  detectedToTransaction,
  ignoreDetected,
  listPendingDetected,
  restoreDetected,
  undoAddDetected,
} from '../db/detected';
import { useFocusQuery } from '../hooks/useFocusQuery';
import { syncDetectedPayments } from '../services/detection';
import { loanLabel } from '../domain/loans';
import { categoryIdForSave } from '../domain/transactionForm';
import { formatDayLabel } from '../utils/dates';
import { formatINR } from '../utils/money';

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
  const [busy, setBusy] = useState(false);
  // Choices made on a card before tapping Add (item id -> category id / loan type).
  const [categoryChoices, setCategoryChoices] = useState({});
  const [loanChoices, setLoanChoices] = useState({});
  const [undoAction, setUndoAction] = useState(null);
  const hideUndo = useCallback(() => setUndoAction(null), []);

  const loader = useCallback(async () => {
    await syncDetectedPayments(db);
    const categories = await listCategories(db);
    const items = await listPendingDetected(db, categories);
    return { categories, items };
  }, [db]);
  const { data, error, reload } = useFocusQuery(loader);

  /** Runs an action once (no double taps), then offers Undo. */
  async function runWithUndo(action, undo, message) {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      await action();
      setUndoAction({ message, undo });
    } catch (actionError) {
      console.error(actionError);
      Alert.alert('Something went wrong', actionError.message || 'Please try again.');
    } finally {
      setBusy(false);
      reload();
    }
  }

  async function handleUndo() {
    const action = undoAction;
    setUndoAction(null);
    if (!action) {
      return;
    }
    try {
      await action.undo();
    } catch (undoError) {
      Alert.alert('Could not undo', undoError.message || 'Please try again.');
    } finally {
      reload();
    }
  }

  /** The transaction an item becomes with the choices made on its card. */
  function transactionFor(item) {
    const loanType = loanChoices[item.id] ?? null;
    const categoryId = categoryIdForSave(
      { loanType, categoryId: categoryChoices[item.id] ?? item.suggestedCategoryId },
      data.categories,
    );
    return detectedToTransaction(item, categoryId, loanType);
  }

  /** Ready for one-tap Add: not a possible duplicate, has a category, and a loan has a name. */
  function isReady(item) {
    const values = transactionFor(item);
    return !item.possibleDuplicate && values.categoryId != null && (!values.loanType || Boolean(item.counterparty));
  }

  function handleAdd(item) {
    const values = transactionFor(item);
    const kind = values.loanType ? loanLabel(values.loanType) : item.direction === 'credit' ? 'Income' : 'Expense';
    const save = () =>
      runWithUndo(
        () => addDetectedAsTransaction(db, item.id, values),
        () => undoAddDetected(db, item.id),
        `${kind} added: ${formatINR(item.amountPaise)}`,
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
      () => restoreDetected(db, item.id),
      `Ignored: ${formatINR(item.amountPaise)}`,
    );
  }

  const handleEdit = (item) =>
    router.push({
      pathname: '/transaction/new',
      params: { detectedId: item.id, loanType: loanChoices[item.id] ?? '' },
    });

  /** Adds every ready item with the choices shown on its card. */
  function handleAddAll(items) {
    const ready = items.filter(isReady);
    if (ready.length === 0) {
      return;
    }
    const skipped = items.length - ready.length;
    Alert.alert(
      `Add ${ready.length} ${ready.length === 1 ? 'payment' : 'payments'}?`,
      `They are saved with the categories shown on each card.${
        skipped > 0
          ? ` ${skipped} ${skipped === 1 ? 'payment needs' : 'payments need'} a check first (possible duplicate or missing name).`
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
                for (const item of ready) {
                  await addDetectedAsTransaction(db, item.id, transactionFor(item));
                  added.push(item.id);
                }
              },
              async () => {
                for (const id of added) {
                  await undoAddDetected(db, id);
                }
              },
              `Added ${ready.length} ${ready.length === 1 ? 'payment' : 'payments'}`,
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
  const addableCount = data.items.filter(isReady).length;

  return (
    <View style={styles.screen}>
      <SectionList
        sections={groupByDay(data.items)}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.content}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          data.items.length > 0 ? (
            <View style={styles.headerBlock}>
              <View style={styles.header}>
                <Text style={styles.summary}>
                  {data.items.length} to review
                  {duplicateCount > 0
                    ? ` · ${duplicateCount} possible ${duplicateCount === 1 ? 'duplicate' : 'duplicates'}`
                    : ''}
                </Text>
                <Pressable accessibilityRole="button" onPress={() => router.push('/accounts')} hitSlop={8}>
                  <Text style={styles.link}>Bank accounts</Text>
                </Pressable>
              </View>
              {addableCount > 1 ? (
                <Button
                  label={`Add all ${addableCount}`}
                  variant="secondary"
                  onPress={() => handleAddAll(data.items)}
                  disabled={busy}
                />
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
            loanType={loanChoices[item.id] ?? null}
            onChangeLoanType={(value) => setLoanChoices((current) => ({ ...current, [item.id]: value }))}
            busy={busy}
            onAdd={() => handleAdd(item)}
            onEdit={() => handleEdit(item)}
            onIgnore={() => handleIgnore(item)}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <EmptyState title="All caught up" message="New payments from your bank SMS will appear here." />
        }
      />
      <UndoBar action={undoAction} onUndo={handleUndo} onHide={hideUndo} />
    </View>
  );
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
