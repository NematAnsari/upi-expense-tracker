// Expenses tab, laid out like Given & Taken: two tiles (Spent, Received) with
// a + to add, a to-do card (payments to review, expenses missing a purpose), then this month's expenses and
// income with All / Paid / Received tabs, search and Filters (a sheet with sort
// order, category, payment method and bank account icons).
// Swipe a row right to edit or left to delete. History has every month.
// The list is a FlatList, so a busy month only draws the rows on screen.
// Money given to or taken from people is on its own tab (given-taken.js).

import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Amount } from '../../components/Amount';
import { ChoiceRow, countFilters, FilterButton, FilterSheet, PaymentFilters } from '../../components/FilterSheet';
import { ICONS } from '../../components/icons';
import { MonthSelector } from '../../components/MonthSelector';
import { SegmentedControl } from '../../components/SegmentedControl';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { RepeatGroupRow } from '../../components/RepeatGroupRow';
import { TextField } from '../../components/TextField';
import { TextLink } from '../../components/TextLink';
import { TodoCard } from '../../components/TodoCard';
import { TotalTile } from '../../components/TotalTile';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { listAccounts } from '../../db/accounts';
import { listCategories } from '../../db/categories';
import { countPendingDetected } from '../../db/detected';
import { getDashboardData } from '../../db/reports';
import { listTransactions } from '../../db/transactions';
import { groupRepeats } from '../../domain/repeats';
import { pickableCategories } from '../../domain/transactionForm';
import { useDeleteTransaction } from '../../hooks/useDeleteTransaction';
import { useFocusQuery } from '../../hooks/useFocusQuery';
import { syncDetectedPayments } from '../../services/detection';
import { formatMonthLabel, getMonthKey, getMonthRange } from '../../utils/dates';
import { formatINR } from '../../utils/money';

// Below this many entries the month fits on a screen, so no search box is shown.
const SEARCH_FROM = 6;

const LISTS = {
  all: { label: 'All', direction: null },
  paid: { label: 'Paid', direction: 'debit' },
  received: { label: 'Received', direction: 'credit' },
};

const NO_FILTERS = { categoryId: null, paymentMethod: null, accountId: null };

const SORTS = [
  { value: 'latest', label: 'Latest', draw: ICONS.latest },
  { value: 'largest', label: 'Largest', draw: ICONS.largest },
];

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

/** The tiles' last line in the current month: "Today ₹200.00" (count in a pill) or "Nothing today". */
function todayText(paise) {
  return paise > 0 ? `Today ${formatINR(paise)}` : 'Nothing today';
}

export default function ExpensesScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [monthKey, setMonthKey] = useState(getMonthKey());
  const [list, setList] = useState('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('latest');
  const [filters, setFilters] = useState(NO_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const loader = useCallback(async () => {
    // Pick up payments captured while the app was closed before reading totals.
    await syncDetectedPayments(db);
    const month = getMonthRange(monthKey);
    const [dashboard, pendingCount, entries, categories, accounts] = await Promise.all([
      getDashboardData(db, monthKey),
      countPendingDetected(db),
      // Expenses and income only (newest first); money given and taken has its own tab.
      listTransactions(db, { startMs: month.startMs, endMs: month.endMs, kind: 'regular' }),
      listCategories(db),
      listAccounts(db),
    ]);
    return { ...dashboard, pendingCount, entries, categories: pickableCategories(categories), accounts };
  }, [db, monthKey]);
  const { data, error, reload } = useFocusQuery(loader);
  const deleteWithConfirm = useDeleteTransaction(reload);

  // Kept the same between renders, so rows that did not change are not redrawn.
  const openTransaction = useCallback(
    (transaction) => router.push({ pathname: '/transaction/[id]', params: { id: transaction.id } }),
    [router],
  );
  const addNew = (params) => router.push({ pathname: '/transaction/new', params });

  // Runs only on tap. `at` makes each tap a new navigation, so History re-applies the filter.
  function reviewMissingPurpose() {
    router.navigate({ pathname: '/history', params: { filter: 'missing-purpose', month: monthKey, at: Date.now() } });
  }

  function renderEmpty() {
    if (!data) {
      return null;
    }
    if (data.entries.length === 0) {
      return (
        <EmptyState
          title="No expenses or income yet"
          message={`Nothing paid or received in ${formatMonthLabel(monthKey)}. Tap + on a box above to add one.`}
        />
      );
    }
    if (shown.length === 0 && filterCount > 0) {
      return (
        <EmptyState
          title="Nothing found"
          message="No entries match these filters this month."
          actionLabel="Clear filters"
          onAction={() => setFilters(NO_FILTERS)}
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
    return null;
  }

  // The rows look like one card: the first row has the top corners, the last the bottom ones.
  const renderRow = ({ item, index }) => (
    <View style={[styles.cardRow, index === 0 && styles.cardFirst, index === rows.length - 1 && styles.cardLast]}>
      <View style={index > 0 && styles.divider}>
        <RepeatGroupRow group={item} onEdit={openTransaction} onDelete={deleteWithConfirm} />
      </View>
    </View>
  );

  // Filtered on the phone, so typing in search is instant. The sheet's filters
  // come first, so the tab counts follow them.
  const filterCount = countFilters(filters);
  // Today's totals only make sense while looking at the current month; past
  // months show just the count by the tile's title.
  const thisMonth = monthKey === getMonthKey();
  const entries = (data?.entries ?? []).filter(
    (entry) =>
      (filters.categoryId == null || entry.categoryId === filters.categoryId) &&
      (filters.paymentMethod == null || entry.paymentMethod === filters.paymentMethod) &&
      (filters.accountId == null || entry.accountId === filters.accountId),
  );
  // Tapping the selected choice again clears that filter.
  const toggleFilter = (key, value) =>
    setFilters((current) => ({ ...current, [key]: current[key] === value ? null : value }));
  function clearSheet() {
    setFilters(NO_FILTERS);
    setSort('latest');
  }
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
  // Entries come newest first; sorting by Largest re-orders them (newest first on a tie).
  const shown = sort === 'largest' ? [...matching].sort((a, b) => b.amountPaise - a.amountPaise) : matching;
  // Repeat purchases (same name, category and day) share one row; Largest orders by the row's total.
  const grouped = groupRepeats(matching);
  const rows = sort === 'largest' ? [...grouped].sort((a, b) => b.totalPaise - a.totalPaise) : grouped;
  // Totals of what is shown, for the line under the Filters button.
  const sum = (direction) =>
    shown.filter((entry) => entry.direction === direction).reduce((total, entry) => total + entry.amountPaise, 0);
  const options = Object.entries(LISTS).map(([value, { label }]) => ({
    value,
    label: `${label} (${inList(value).length})`,
  }));

  const header = (
    <View style={styles.header}>
      <MonthSelector monthKey={monthKey} onChange={setMonthKey} />

      {error ? <ErrorState onRetry={reload} /> : null}
      {!data && !error ? <LoadingState /> : null}

      {data ? (
        <>
          <View style={styles.totals}>
            <TotalTile
              label="Spent"
              count={data.monthTotals.count}
              paise={data.monthTotals.totalPaise}
              direction="debit"
              action="Add expense"
              zeroText="Nothing spent"
              subText={thisMonth ? todayText(data.todayTotals.totalPaise) : null}
              subCount={data.todayTotals.count}
              onPress={() => addNew({})}
            />
            <TotalTile
              label="Received"
              count={data.receivedTotals.count}
              paise={data.receivedTotals.totalPaise}
              direction="credit"
              action="Add income"
              zeroText="Nothing received"
              subText={thisMonth ? todayText(data.todayReceived.totalPaise) : null}
              subCount={data.todayReceived.count}
              onPress={() => addNew({ direction: 'credit' })}
            />
          </View>

          {/* Review first: those payments are not counted until added. */}
          <TodoCard
            items={[
              data.pendingCount > 0 && {
                key: 'review',
                icon: 'review',
                title: 'Payments to review',
                count: data.pendingCount,
                action: 'Review',
                message: `${plural(data.pendingCount, 'payment needs', 'payments need')} review`,
                onPress: () => router.push('/review-payments'),
              },
              data.missingPurposeCount > 0 && {
                key: 'purpose',
                icon: 'purpose',
                title: 'Need a purpose',
                count: data.missingPurposeCount,
                action: 'Add',
                message: `${plural(data.missingPurposeCount, 'expense needs', 'expenses need')} a purpose`,
                onPress: reviewMissingPurpose,
              },
            ].filter(Boolean)}
          />

          {(data.entries ?? []).length > 0 ? (
            <>
              <SegmentedControl options={options} value={list} onChange={setList} />
              <View style={styles.searchLine}>
                {entries.length >= SEARCH_FROM ? (
                  <TextField
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search by name or purpose"
                    returnKeyType="search"
                    autoCorrect={false}
                    accessibilityLabel="Search by name or purpose"
                    style={styles.search}
                  />
                ) : null}
                <FilterButton count={filterCount + (sort === 'latest' ? 0 : 1)} onPress={() => setFiltersOpen(true)} />
              </View>
              {filterCount > 0 ? (
                <Text style={styles.summary}>
                  {`${plural(shown.length, 'entry', 'entries')} · Spent `}
                  <Amount paise={sum('debit')} direction="debit" size="sm" />
                  {' · Received '}
                  <Amount paise={sum('credit')} direction="credit" size="sm" />
                </Text>
              ) : null}
              <FilterSheet
                visible={filtersOpen}
                onClose={() => setFiltersOpen(false)}
                onClear={clearSheet}
                showLabel={`Show ${plural(shown.length, 'entry', 'entries')}`}
              >
                <ChoiceRow label="Sort by" choices={SORTS} value={sort} onSelect={setSort} />
                <PaymentFilters
                  filters={filters}
                  onToggle={toggleFilter}
                  categories={data.categories}
                  accounts={data.accounts}
                />
              </FilterSheet>
            </>
          ) : null}
        </>
      ) : null}
    </View>
  );

  const footer = data ? (
    <View style={styles.footer}>
      {shown.length > 0 ? (
        <Text style={styles.hint}>Tip: swipe a row right to edit it, or left to delete it.</Text>
      ) : null}
      {(data.entries ?? []).length > 0 ? (
        <View style={styles.viewAll}>
          <TextLink label="View all in History ›" onPress={() => router.navigate('/history')} />
        </View>
      ) : null}
    </View>
  ) : null;

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      data={data ? rows : []}
      keyExtractor={(item) => item.key}
      renderItem={renderRow}
      ListHeaderComponent={header}
      ListFooterComponent={footer}
      ListEmptyComponent={renderEmpty()}
      // Draw about two screens of rows at a time; more as you scroll.
      initialNumToRender={12}
      maxToRenderPerBatch={12}
      windowSize={7}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  header: { gap: spacing.lg, marginBottom: spacing.lg },
  footer: { gap: spacing.lg, marginTop: spacing.lg },
  // One card made of rows (see renderRow); same look as Card.
  cardRow: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  cardFirst: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    paddingTop: spacing.sm,
  },
  cardLast: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
    paddingBottom: spacing.sm,
  },
  totals: { flexDirection: 'row', gap: spacing.md },
  // Search on the left, Filters on the right (alone on the right when there is no search box).
  searchLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.sm },
  search: { flex: 1 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  hint: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' },
  summary: { fontSize: fontSize.sm, color: colors.textMuted },
  viewAll: { alignItems: 'center' },
});
