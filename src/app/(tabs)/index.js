// Expenses tab, laid out like Given & Taken: two tiles (Spent, Received) with
// a + to add, payments waiting for review, then this month's expenses and
// income with All / Paid / Received tabs, search and sort.
// Swipe a row right to edit or left to delete. History has every month.
// Money given to or taken from people is on its own tab (given-taken.js).

import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '../../components/Card';
import { Chip } from '../../components/Chip';
import { ChipRow } from '../../components/ChipRow';
import { MonthSelector } from '../../components/MonthSelector';
import { NoticeBar } from '../../components/NoticeBar';
import { SegmentedControl } from '../../components/SegmentedControl';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { SwipeableTransactionRow } from '../../components/SwipeableTransactionRow';
import { TextField } from '../../components/TextField';
import { TextLink } from '../../components/TextLink';
import { TotalTile } from '../../components/TotalTile';
import { colors, fontSize, spacing } from '../../constants/theme';
import { countPendingDetected } from '../../db/detected';
import { getDashboardData } from '../../db/reports';
import { listTransactions } from '../../db/transactions';
import { useDeleteTransaction } from '../../hooks/useDeleteTransaction';
import { useFocusQuery } from '../../hooks/useFocusQuery';
import { syncDetectedPayments } from '../../services/detection';
import { formatMonthLabel, getMonthKey, getMonthRange } from '../../utils/dates';

// Below this many entries the month fits on a screen, so no search box is shown.
const SEARCH_FROM = 6;

const LISTS = {
  all: { label: 'All', direction: null },
  paid: { label: 'Paid', direction: 'debit' },
  received: { label: 'Received', direction: 'credit' },
};

const SORTS = [
  { value: 'latest', label: 'Latest' },
  { value: 'largest', label: 'Largest Amount' },
];

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

export default function ExpensesScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [monthKey, setMonthKey] = useState(getMonthKey());
  const [list, setList] = useState('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('latest');

  const loader = useCallback(async () => {
    // Pick up payments captured while the app was closed before reading totals.
    await syncDetectedPayments(db);
    const month = getMonthRange(monthKey);
    const [dashboard, pendingCount, entries] = await Promise.all([
      getDashboardData(db, monthKey),
      countPendingDetected(db),
      // Expenses and income only (newest first); money given and taken has its own tab.
      listTransactions(db, { startMs: month.startMs, endMs: month.endMs, kind: 'regular' }),
    ]);
    return { ...dashboard, pendingCount, entries };
  }, [db, monthKey]);
  const { data, error, reload } = useFocusQuery(loader);
  const deleteWithConfirm = useDeleteTransaction(reload);

  const openTransaction = (transaction) =>
    router.push({ pathname: '/transaction/[id]', params: { id: transaction.id } });
  const addNew = (params) => router.push({ pathname: '/transaction/new', params });

  // Runs only on tap. `at` makes each tap a new navigation, so History re-applies the filter.
  function reviewMissingPurpose() {
    router.navigate({ pathname: '/history', params: { filter: 'missing-purpose', month: monthKey, at: Date.now() } });
  }

  function renderList() {
    if (data.entries.length === 0) {
      return (
        <EmptyState
          title="No expenses or income yet"
          message={`Nothing paid or received in ${formatMonthLabel(monthKey)}. Tap + on a box above to add one.`}
        />
      );
    }
    if (shown.length === 0) {
      return term ? (
        <EmptyState
          title="Nothing found"
          message={`Nothing matches "${search.trim()}" this month.`}
          actionLabel="Clear search"
          onAction={() => setSearch('')}
        />
      ) : (
        <EmptyState title="Nothing here yet" message={`No ${LISTS[list].label.toLowerCase()} entries this month.`} />
      );
    }
    return (
      <Card>
        {shown.map((transaction, index) => (
          <View key={transaction.id} style={index > 0 && styles.divider}>
            <SwipeableTransactionRow
              transaction={transaction}
              variant="simple"
              onEdit={openTransaction}
              onDelete={deleteWithConfirm}
            />
          </View>
        ))}
      </Card>
    );
  }

  // Filtered on the phone, so typing in search is instant.
  const entries = data?.entries ?? [];
  const inList = (name) =>
    LISTS[name].direction ? entries.filter((entry) => entry.direction === LISTS[name].direction) : entries;
  // Matches any part of the name or purpose, ignoring case.
  const term = search.trim().toLowerCase();
  const matching = inList(list).filter(
    (entry) =>
      !term ||
      (entry.merchant ?? '').toLowerCase().includes(term) ||
      (entry.purpose ?? '').toLowerCase().includes(term),
  );
  // Entries come newest first; Largest Amount re-orders them (newest first on a tie).
  const shown = sort === 'largest' ? [...matching].sort((a, b) => b.amountPaise - a.amountPaise) : matching;
  const options = Object.entries(LISTS).map(([value, { label }]) => ({
    value,
    label: `${label} (${inList(value).length})`,
  }));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <MonthSelector monthKey={monthKey} onChange={setMonthKey} />

      {error ? <ErrorState onRetry={reload} /> : null}
      {!data && !error ? <LoadingState /> : null}

      {data ? (
        <>
          <View style={styles.totals}>
            <TotalTile
              label="Spent"
              paise={data.monthTotals.totalPaise}
              direction="debit"
              action="Add expense"
              zeroText="Nothing spent"
              subText={plural(data.monthTotals.count, 'expense', 'expenses')}
              onPress={() => addNew({})}
            />
            <TotalTile
              label="Received"
              paise={data.receivedTotals.totalPaise}
              direction="credit"
              action="Add income"
              zeroText="Nothing received"
              subText={plural(data.receivedTotals.count, 'entry', 'entries')}
              onPress={() => addNew({ direction: 'credit' })}
            />
          </View>

          {data.missingPurposeCount > 0 ? (
            <TextLink
              label={`${plural(data.missingPurposeCount, 'expense needs', 'expenses need')} a purpose ›`}
              onPress={reviewMissingPurpose}
            />
          ) : null}

          {data.pendingCount > 0 ? (
            <NoticeBar
              message={`${plural(data.pendingCount, 'payment needs', 'payments need')} review`}
              actionLabel="Review"
              onPress={() => router.push('/review-payments')}
            />
          ) : null}

          {entries.length > 0 ? (
            <>
              <SegmentedControl options={options} value={list} onChange={setList} />
              {entries.length >= SEARCH_FROM ? (
                <TextField
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search by name or purpose"
                  returnKeyType="search"
                  autoCorrect={false}
                  accessibilityLabel="Search by name or purpose"
                />
              ) : null}
              <View style={styles.listHeader}>
                <View style={styles.sortChips}>
                  <ChipRow>
                    {SORTS.map((option) => (
                      <Chip
                        key={option.value}
                        label={option.label}
                        selected={sort === option.value}
                        onPress={() => setSort(option.value)}
                      />
                    ))}
                  </ChipRow>
                </View>
                <TextLink label="View all" onPress={() => router.navigate('/history')} />
              </View>
            </>
          ) : null}

          {renderList()}

          {shown.length > 0 ? (
            <Text style={styles.hint}>Tip: swipe a row right to edit it, or left to delete it.</Text>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl },
  totals: { flexDirection: 'row', gap: spacing.md },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  sortChips: { flex: 1 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  hint: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' },
});
