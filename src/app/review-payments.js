// Review Payments: payments found in bank SMS and UPI app notifications,
// waiting for you to Add or Ignore. Grouped by day. Every Add or Ignore can be
// undone for a few seconds.

import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
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
  // Categories you picked on a card before tapping Add (item id -> category id).
  const [categoryChoices, setCategoryChoices] = useState({});
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

  function handleAdd(item) {
    const categoryId = categoryChoices[item.id] ?? item.suggestedCategoryId;
    const kind = item.direction === 'credit' ? 'Income' : 'Expense';
    const save = () =>
      runWithUndo(
        () => addDetectedAsTransaction(db, item.id, detectedToTransaction(item, categoryId)),
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

  const handleEdit = (item) => router.push({ pathname: '/transaction/new', params: { detectedId: item.id } });

  if (error) {
    return <ErrorState onRetry={reload} />;
  }
  if (!data) {
    return <LoadingState />;
  }

  const duplicateCount = data.items.filter((item) => item.possibleDuplicate).length;

  return (
    <View style={styles.screen}>
      <SectionList
        sections={groupByDay(data.items)}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.content}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          data.items.length > 0 ? (
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
          ) : null
        }
        renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
        renderItem={({ item }) => (
          <DetectedPaymentCard
            item={item}
            categories={data.categories}
            categoryId={categoryChoices[item.id] ?? item.suggestedCategoryId}
            onChangeCategory={(id) => setCategoryChoices((current) => ({ ...current, [item.id]: id }))}
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
