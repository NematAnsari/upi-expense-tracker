// History: every expense and income entry, with search and filters. Swipe a
// row right (or tap it) to edit, swipe left (or long-press) to delete.
// Filters opens a sheet: sort order (newest / oldest), missing purpose, all
// months, then category, payment method and bank account as icons.
// Amounts: red paid, green received.
// Money given and taken is not listed here; each person's page has its history.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Chip } from '../components/basics/Chip';
import { SideScrollRow } from '../components/basics/SideScrollRow';
import {
  ChoiceRow,
  countFilters,
  FilterButton,
  FilterSheet,
  NO_FILTERS,
  PaymentFilters,
} from '../components/sections/FilterSheet';
import { ICONS } from '../components/icons/icons';
import { MonthSelector } from '../components/sections/MonthSelector';
import { EmptyState, ErrorState, LoadingState } from '../components/basics/ScreenStates';
import { TotalsLine } from '../components/sections/TotalsLine';
import { TransactionListItem } from '../components/rows/TransactionListItem';
import { TextField } from '../components/basics/TextField';
import { colors, spacing } from '../constants/theme';
import { listAccounts } from '../db/accounts';
import { listCategories } from '../db/categories';
import { listTransactions } from '../db/transactions';
import { groupRepeats } from '../domain/repeats';
import { pickableCategories } from '../domain/transactionForm';
import { useDeleteTransaction } from '../hooks/useDeleteTransaction';
import { useFocusQuery } from '../hooks/useFocusQuery';
import { getMonthKey, getMonthRange } from '../utils/dates';
import { plural } from '../utils/text';

// The main chips (see listTransactions `kind`). All three leave money given and taken out.
const KIND_FILTERS = [
  { value: 'regular', label: 'All' },
  { value: 'paid', label: 'Paid' },
  { value: 'received', label: 'Received' },
];

// listTransactions `sort`: by date, newest or oldest first.
const SORTS = [
  { value: 'desc', label: 'Newest', draw: ICONS.latest },
  { value: 'asc', label: 'Oldest', draw: ICONS.oldest },
];

function Separator() {
  return <View style={styles.separator} />;
}

export default function HistoryScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams();
  const [search, setSearch] = useState('');
  const [monthKey, setMonthKey] = useState(getMonthKey);
  const [allMonths, setAllMonths] = useState(false);
  const [kind, setKind] = useState('regular');
  const [missingPurpose, setMissingPurpose] = useState(false);
  const [paymentFilters, setPaymentFilters] = useState(NO_FILTERS);
  const [sort, setSort] = useState('desc');
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Links from Expenses (missing purpose) and Reports (a category) open this page with filter params.
  // Applied while rendering, not in an effect, so the old list never flashes.
  const [appliedLinkAt, setAppliedLinkAt] = useState(null);
  if (params.filter && params.at !== appliedLinkAt) {
    setAppliedLinkAt(params.at);
    setKind(params.filter === 'category' ? 'paid' : 'regular');
    setPaymentFilters(
      params.filter === 'category' ? { ...NO_FILTERS, categoryId: Number(params.categoryId) } : NO_FILTERS,
    );
    setMissingPurpose(params.filter === 'missing-purpose');
    setSearch('');
    if (params.month) {
      setMonthKey(params.month);
      setAllMonths(false);
    }
  }

  const loader = useCallback(async () => {
    const range = allMonths ? {} : getMonthRange(monthKey);
    const [transactions, categories, accounts] = await Promise.all([
      listTransactions(db, { ...range, kind, search, missingPurpose, sort, ...paymentFilters }),
      listCategories(db),
      listAccounts(db),
    ]);
    return { transactions, categories: pickableCategories(categories), accounts };
  }, [db, monthKey, allMonths, kind, search, missingPurpose, sort, paymentFilters]);
  const { data, error, reload } = useFocusQuery(loader);

  // Regrouped only when new data loads, not on every render.
  const rows = useMemo(() => (data ? groupRepeats(data.transactions) : []), [data]);
  const transactionCount = data?.transactions.length ?? 0;
  const paymentFilterCount = countFilters(paymentFilters);
  // Everything set inside the sheet (shown on the Filters button).
  const sheetFilterCount = [missingPurpose, allMonths, sort === 'asc'].filter(Boolean).length + paymentFilterCount;
  const hasFilters = Boolean(search.trim()) || kind !== 'regular' || missingPurpose || paymentFilterCount > 0;

  const deleteWithConfirm = useDeleteTransaction(reload);
  // Kept the same between renders, so rows that did not change are not redrawn.
  const openTransaction = useCallback(
    (transaction) => router.push({ pathname: '/transaction/[id]', params: { id: transaction.id } }),
    [router],
  );
  // Tapping the selected choice again clears that filter.
  const toggleFilter = (key, value) =>
    setPaymentFilters((current) => ({ ...current, [key]: current[key] === value ? null : value }));

  function clearFilters() {
    setSearch('');
    setKind('regular');
    setMissingPurpose(false);
    setPaymentFilters(NO_FILTERS);
  }

  function clearSheet() {
    setMissingPurpose(false);
    setAllMonths(false);
    setSort('desc');
    setPaymentFilters(NO_FILTERS);
  }

  function renderEmpty() {
    if (missingPurpose && !search.trim() && paymentFilterCount === 0) {
      return (
        <EmptyState
          title="All caught up"
          message="Every expense in this view has a purpose."
          actionLabel="Show all transactions"
          onAction={clearFilters}
        />
      );
    }
    if (hasFilters) {
      return (
        <EmptyState
          title="No matching transactions"
          message="Try a different search or filter."
          actionLabel="Clear filters"
          onAction={clearFilters}
        />
      );
    }
    return (
      <EmptyState
        title="No transactions yet"
        message={allMonths ? 'Money you pay or receive will appear here.' : 'Nothing recorded for this month.'}
        actionLabel="Add transaction"
        onAction={() => router.push('/transaction/new')}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.filters}>
        <TextField
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name, shop or purpose"
          returnKeyType="search"
          clearButtonMode="while-editing"
          accessibilityLabel="Search by name, shop or purpose"
        />

        {allMonths ? null : <MonthSelector monthKey={monthKey} onChange={setMonthKey} />}

        <View style={styles.chipsLine}>
          <View style={styles.flex}>
            <SideScrollRow>
              {KIND_FILTERS.map((option) => (
                <Chip
                  key={option.label}
                  label={option.label}
                  selected={kind === option.value}
                  onPress={() => setKind(option.value)}
                />
              ))}
            </SideScrollRow>
          </View>
          <FilterButton count={sheetFilterCount} onPress={() => setFiltersOpen(true)} />
        </View>
      </View>

      {data ? (
        <FilterSheet
          visible={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          onClear={clearSheet}
          showLabel={`Show ${plural(transactionCount, 'entry', 'entries')}`}
        >
          <ChoiceRow label="Sort by" choices={SORTS} value={sort} onSelect={setSort} />
          <SideScrollRow>
            <Chip
              label="Missing purpose"
              selected={missingPurpose}
              onPress={() => setMissingPurpose(!missingPurpose)}
            />
            <Chip label="All months" selected={allMonths} onPress={() => setAllMonths(!allMonths)} />
          </SideScrollRow>
          <PaymentFilters
            filters={paymentFilters}
            onToggle={toggleFilter}
            categories={data.categories}
            accounts={data.accounts}
          />
        </FilterSheet>
      ) : null}

      {error ? <ErrorState onRetry={reload} /> : null}
      {!data && !error ? <LoadingState /> : null}

      {data ? (
        <FlatList
          // Repeat purchases (same name, category and day) share one row.
          data={rows}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            transactionCount > 0 ? (
              <TotalsLine
                entries={data.transactions}
                countText={plural(transactionCount, 'transaction', 'transactions')}
                style={styles.summary}
              />
            ) : null
          }
          ItemSeparatorComponent={Separator}
          renderItem={({ item }) => (
            <TransactionListItem
              group={item}
              background={colors.background}
              onEdit={openTransaction}
              onDelete={deleteWithConfirm}
            />
          )}
          ListEmptyComponent={renderEmpty()}
          // All months can be thousands of entries: draw about two screens at a time.
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={7}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  filters: {
    padding: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  chipsLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  // Added to TotalsLine's own text style.
  summary: { paddingVertical: spacing.sm },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
});
