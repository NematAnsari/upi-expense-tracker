// History: every expense and income entry, with search and filters. Swipe a
// row right (or tap it) to edit, swipe left (or long-press) to delete.
// Filters opens a sheet: sort order (newest / oldest), missing purpose, all
// months, then category, payment method and bank account as icons.
// Amounts: red paid, green received.
// Money given and taken is not listed here; each person's page has its history.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Amount } from '../components/Amount';
import { Chip } from '../components/Chip';
import { ChipRow } from '../components/ChipRow';
import { ChoiceRow, countFilters, FilterButton, FilterSheet, PaymentFilters } from '../components/FilterSheet';
import { ICONS } from '../components/icons';
import { MonthSelector } from '../components/MonthSelector';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { RepeatGroupRow } from '../components/RepeatGroupRow';
import { TextField } from '../components/TextField';
import { colors, fontSize, spacing } from '../constants/theme';
import { listAccounts } from '../db/accounts';
import { listCategories } from '../db/categories';
import { listTransactions } from '../db/transactions';
import { groupRepeats } from '../domain/repeats';
import { pickableCategories } from '../domain/transactionForm';
import { useDeleteTransaction } from '../hooks/useDeleteTransaction';
import { useFocusQuery } from '../hooks/useFocusQuery';
import { getMonthKey, getMonthRange } from '../utils/dates';

// The main chips (see listTransactions `kind`). All three leave money given and taken out.
const KIND_FILTERS = [
  { value: 'regular', label: 'All' },
  { value: 'paid', label: 'Paid' },
  { value: 'received', label: 'Received' },
];

const NO_FILTERS = { categoryId: null, paymentMethod: null, accountId: null };

// listTransactions `sort`: by date, newest or oldest first.
const SORTS = [
  { value: 'desc', label: 'Newest', draw: ICONS.latest },
  { value: 'asc', label: 'Oldest', draw: ICONS.oldest },
];

/** Total of one direction. */
function sumPaise(transactions, direction) {
  return transactions
    .filter((transaction) => transaction.direction === direction)
    .reduce((sum, transaction) => sum + transaction.amountPaise, 0);
}

export default function HistoryScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams();
  const [search, setSearch] = useState('');
  const [monthKey, setMonthKey] = useState(getMonthKey());
  const [allMonths, setAllMonths] = useState(false);
  const [kind, setKind] = useState('regular');
  const [missingPurpose, setMissingPurpose] = useState(false);
  const [filters, setFilters] = useState(NO_FILTERS);
  const [sort, setSort] = useState('desc');
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Links from other screens open this page with filter params, such as the
  // Expenses tab's "expenses need a purpose" (missing-purpose) or a category
  // tapped on the Reports tab (category, with categoryId).
  // Adjusting state while rendering (instead of in an effect) is React's
  // recommended way to react to changed inputs, and avoids a flash of the old list.
  const [appliedLinkAt, setAppliedLinkAt] = useState(null);
  if (params.filter && params.at !== appliedLinkAt) {
    setAppliedLinkAt(params.at);
    setKind(params.filter === 'category' ? 'paid' : 'regular');
    setFilters(params.filter === 'category' ? { ...NO_FILTERS, categoryId: Number(params.categoryId) } : NO_FILTERS);
    setMissingPurpose(params.filter === 'missing-purpose');
    setSearch(params.search ?? '');
    if (params.month) {
      setMonthKey(params.month);
      setAllMonths(false);
    }
  }

  const loader = useCallback(async () => {
    const range = allMonths ? {} : getMonthRange(monthKey);
    const [transactions, categories, accounts] = await Promise.all([
      listTransactions(db, { ...range, kind, search, missingPurpose, sort, ...filters }),
      listCategories(db),
      listAccounts(db),
    ]);
    return { transactions, categories: pickableCategories(categories), accounts };
  }, [db, monthKey, allMonths, kind, search, missingPurpose, sort, filters]);
  const { data, error, reload } = useFocusQuery(loader);

  const transactions = data?.transactions ?? [];
  const spentPaise = sumPaise(transactions, 'debit');
  const receivedPaise = sumPaise(transactions, 'credit');
  const sheetFilterCount = countFilters(filters);
  // Everything set inside the sheet (shown on the Filters button).
  const panelFilterCount = [missingPurpose, allMonths, sort === 'asc'].filter(Boolean).length + sheetFilterCount;
  const hasFilters = Boolean(search.trim()) || kind !== 'regular' || missingPurpose || sheetFilterCount > 0;

  const handleDelete = useDeleteTransaction(reload);
  // Kept the same between renders, so rows that did not change are not redrawn.
  const openTransaction = useCallback(
    (transaction) => router.push({ pathname: '/transaction/[id]', params: { id: transaction.id } }),
    [router],
  );
  // Tapping the selected choice again clears that filter.
  const toggleFilter = (key, value) =>
    setFilters((current) => ({ ...current, [key]: current[key] === value ? null : value }));

  function clearFilters() {
    setSearch('');
    setKind('regular');
    setMissingPurpose(false);
    setFilters(NO_FILTERS);
  }

  function clearSheet() {
    setMissingPurpose(false);
    setAllMonths(false);
    setSort('desc');
    setFilters(NO_FILTERS);
  }

  function renderEmpty() {
    if (missingPurpose && !search.trim() && sheetFilterCount === 0) {
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
            <ChipRow>
              {KIND_FILTERS.map((option) => (
                <Chip
                  key={option.label}
                  label={option.label}
                  selected={kind === option.value}
                  onPress={() => setKind(option.value)}
                />
              ))}
            </ChipRow>
          </View>
          <FilterButton count={panelFilterCount} onPress={() => setFiltersOpen(true)} />
        </View>
      </View>

      {data ? (
        <FilterSheet
          visible={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          onClear={clearSheet}
          showLabel={`Show ${transactions.length} ${transactions.length === 1 ? 'entry' : 'entries'}`}
        >
          <ChoiceRow label="Sort by" choices={SORTS} value={sort} onSelect={setSort} />
          <ChipRow>
            <Chip
              label="Missing purpose"
              selected={missingPurpose}
              onPress={() => setMissingPurpose(!missingPurpose)}
            />
            <Chip label="All months" selected={allMonths} onPress={() => setAllMonths(!allMonths)} />
          </ChipRow>
          <PaymentFilters
            filters={filters}
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
          data={groupRepeats(transactions)}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            transactions.length > 0 ? (
              <Text style={styles.summary}>
                {`${transactions.length} ${transactions.length === 1 ? 'transaction' : 'transactions'} · Spent `}
                <Amount paise={spentPaise} direction="debit" size="sm" />
                {' · Received '}
                <Amount paise={receivedPaise} direction="credit" size="sm" />
              </Text>
            ) : null
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <RepeatGroupRow
              group={item}
              background={colors.background}
              onEdit={openTransaction}
              onDelete={handleDelete}
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
  summary: { fontSize: fontSize.sm, color: colors.textMuted, paddingVertical: spacing.sm },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
});
