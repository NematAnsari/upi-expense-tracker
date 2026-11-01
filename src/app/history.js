// History: every expense and income entry, with search and filters. Swipe a
// row right (or tap it) to edit, swipe left (or long-press) to delete.
// Amounts: red paid, green received.
// Money given and taken is not listed here; each person's page has its history.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Amount } from '../components/Amount';
import { Chip } from '../components/Chip';
import { ChipRow } from '../components/ChipRow';
import { MonthSelector } from '../components/MonthSelector';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { TextField } from '../components/TextField';
import { SwipeableTransactionRow } from '../components/SwipeableTransactionRow';
import { colors, fontSize, spacing } from '../constants/theme';
import { listAccounts } from '../db/accounts';
import { listCategories } from '../db/categories';
import { listTransactions } from '../db/transactions';
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
  const [categoryId, setCategoryId] = useState(null);
  const [accountId, setAccountId] = useState(null);
  const [sort, setSort] = useState('desc');
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  // Links from other screens open this page with filter params, such as the
  // Expenses tab's "expenses need a purpose" (missing-purpose).
  // Adjusting state while rendering (instead of in an effect) is React's
  // recommended way to react to changed inputs, and avoids a flash of the old list.
  const [appliedLinkAt, setAppliedLinkAt] = useState(null);
  if (params.filter && params.at !== appliedLinkAt) {
    setAppliedLinkAt(params.at);
    setKind('regular');
    setCategoryId(null);
    setAccountId(null);
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
      listTransactions(db, { ...range, kind, categoryId, search, missingPurpose, accountId, sort }),
      listCategories(db),
      listAccounts(db),
    ]);
    return { transactions, categories, accounts };
  }, [db, monthKey, allMonths, kind, categoryId, search, missingPurpose, accountId, sort]);
  const { data, error, reload } = useFocusQuery(loader);

  const transactions = data?.transactions ?? [];
  const spentPaise = sumPaise(transactions, 'debit');
  const receivedPaise = sumPaise(transactions, 'credit');
  const moreFilterCount = (categoryId != null ? 1 : 0) + (accountId != null ? 1 : 0);
  // How many options inside the Filters panel are on (shown on the Filters chip).
  const panelFilterCount = [missingPurpose, allMonths, sort === 'asc', categoryId != null, accountId != null].filter(
    Boolean,
  ).length;
  const hasFilters = Boolean(search.trim()) || kind !== 'regular' || missingPurpose || moreFilterCount > 0;

  const handleDelete = useDeleteTransaction(reload);

  function clearFilters() {
    setSearch('');
    setKind('regular');
    setMissingPurpose(false);
    setCategoryId(null);
    setAccountId(null);
  }

  function renderEmpty() {
    if (missingPurpose && !search.trim() && moreFilterCount === 0) {
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

        <ChipRow>
          {KIND_FILTERS.map((option) => (
            <Chip
              key={option.label}
              label={option.label}
              selected={kind === option.value}
              onPress={() => setKind(option.value)}
            />
          ))}
          <Chip
            label={panelFilterCount > 0 ? `Filters (${panelFilterCount})` : 'Filters'}
            selected={showMoreFilters || panelFilterCount > 0}
            onPress={() => setShowMoreFilters(!showMoreFilters)}
          />
        </ChipRow>

        {showMoreFilters ? (
          <>
            <ChipRow>
              <Chip
                label="Missing purpose"
                selected={missingPurpose}
                onPress={() => setMissingPurpose(!missingPurpose)}
              />
              <Chip label="All months" selected={allMonths} onPress={() => setAllMonths(!allMonths)} />
              <Chip
                label={sort === 'desc' ? 'Newest first' : 'Oldest first'}
                selected={sort === 'asc'}
                onPress={() => setSort(sort === 'desc' ? 'asc' : 'desc')}
              />
            </ChipRow>

            <ChipRow>
              <Chip label="All categories" selected={categoryId == null} onPress={() => setCategoryId(null)} />
              {pickableCategories(data?.categories ?? []).map((category) => (
                <Chip
                  key={category.id}
                  label={category.name}
                  selected={categoryId === category.id}
                  onPress={() => setCategoryId(category.id)}
                />
              ))}
            </ChipRow>

            {data?.accounts?.length > 0 ? (
              <ChipRow>
                <Chip label="All accounts" selected={accountId == null} onPress={() => setAccountId(null)} />
                {data.accounts.map((account) => (
                  <Chip
                    key={account.id}
                    label={account.nickname}
                    selected={accountId === account.id}
                    onPress={() => setAccountId(account.id)}
                  />
                ))}
              </ChipRow>
            ) : null}
          </>
        ) : null}
      </View>

      {error ? <ErrorState onRetry={reload} /> : null}
      {!data && !error ? <LoadingState /> : null}

      {data ? (
        <FlatList
          data={transactions}
          keyExtractor={(item) => String(item.id)}
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
            <SwipeableTransactionRow
              transaction={item}
              variant="simple"
              background={colors.background}
              onEdit={() => router.push({ pathname: '/transaction/[id]', params: { id: item.id } })}
              onDelete={handleDelete}
            />
          )}
          ListEmptyComponent={renderEmpty()}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  filters: {
    padding: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  summary: { fontSize: fontSize.sm, color: colors.textMuted, paddingVertical: spacing.sm },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
});
