// History: every transaction, with search and filters. Tap to edit, long
// press to delete. Amounts: red paid, green received.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { Amount } from '../../components/Amount';
import { Chip } from '../../components/Chip';
import { ChipRow } from '../../components/ChipRow';
import { MonthSelector } from '../../components/MonthSelector';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { TextField } from '../../components/TextField';
import { TransactionRow } from '../../components/TransactionRow';
import { colors, fontSize, spacing } from '../../constants/theme';
import { listAccounts } from '../../db/accounts';
import { listCategories } from '../../db/categories';
import { deleteTransaction, listTransactions } from '../../db/transactions';
import { useFocusQuery } from '../../hooks/useFocusQuery';
import { confirmDeleteTransaction } from '../../ui/confirmDelete';
import { showMessage } from '../../ui/notify';
import { getMonthKey, getMonthRange } from '../../utils/dates';

const TYPE_FILTERS = [
  { value: null, label: 'All' },
  { value: 'debit', label: 'Paid' },
  { value: 'credit', label: 'Received' },
];

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
  const [direction, setDirection] = useState(null);
  const [missingPurpose, setMissingPurpose] = useState(false);
  const [categoryId, setCategoryId] = useState(null);
  const [accountId, setAccountId] = useState(null);
  const [sort, setSort] = useState('desc');
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  // The Dashboard's "Fill in" link opens this tab with filter params.
  // Adjusting state while rendering (instead of in an effect) is React's
  // recommended way to react to changed inputs, and avoids a flash of the old list.
  const [appliedLinkAt, setAppliedLinkAt] = useState(null);
  if (params.filter === 'missing-purpose' && params.at !== appliedLinkAt) {
    setAppliedLinkAt(params.at);
    setMissingPurpose(true);
    setDirection(null);
    setSearch('');
    setCategoryId(null);
    setAccountId(null);
    if (params.month) {
      setMonthKey(params.month);
      setAllMonths(false);
    }
  }

  const loader = useCallback(async () => {
    const range = allMonths ? {} : getMonthRange(monthKey);
    const [transactions, categories, accounts] = await Promise.all([
      listTransactions(db, { ...range, direction, categoryId, search, missingPurpose, accountId, sort }),
      listCategories(db),
      listAccounts(db),
    ]);
    return { transactions, categories, accounts };
  }, [db, monthKey, allMonths, direction, categoryId, search, missingPurpose, accountId, sort]);
  const { data, error, reload } = useFocusQuery(loader);

  const transactions = data?.transactions ?? [];
  const spentPaise = sumPaise(transactions, 'debit');
  const receivedPaise = sumPaise(transactions, 'credit');
  const moreFilterCount = (categoryId != null ? 1 : 0) + (accountId != null ? 1 : 0);
  const hasFilters = Boolean(search.trim()) || direction != null || missingPurpose || moreFilterCount > 0;

  async function handleDelete(transaction) {
    if (!(await confirmDeleteTransaction(transaction))) {
      return;
    }
    try {
      await deleteTransaction(db, transaction.id);
      showMessage('Transaction deleted');
      reload();
    } catch (deleteError) {
      console.error(deleteError);
      Alert.alert('Could not delete', deleteError.message || 'Please try again.');
    }
  }

  function clearFilters() {
    setSearch('');
    setDirection(null);
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
          placeholder="Search by purpose or name"
          returnKeyType="search"
          clearButtonMode="while-editing"
          accessibilityLabel="Search by purpose or name"
        />

        {allMonths ? null : <MonthSelector monthKey={monthKey} onChange={setMonthKey} />}

        <ChipRow>
          {TYPE_FILTERS.map((option) => (
            <Chip
              key={option.label}
              label={option.label}
              selected={direction === option.value}
              onPress={() => setDirection(option.value)}
            />
          ))}
          <Chip label="Missing purpose" selected={missingPurpose} onPress={() => setMissingPurpose(!missingPurpose)} />
          <Chip label="All months" selected={allMonths} onPress={() => setAllMonths(!allMonths)} />
          <Chip
            label={sort === 'desc' ? 'Newest first ↓' : 'Oldest first ↑'}
            onPress={() => setSort(sort === 'desc' ? 'asc' : 'desc')}
          />
          <Chip
            label={moreFilterCount > 0 ? `More filters (${moreFilterCount})` : 'More filters'}
            selected={showMoreFilters || moreFilterCount > 0}
            onPress={() => setShowMoreFilters(!showMoreFilters)}
          />
        </ChipRow>

        {showMoreFilters ? (
          <>
            <ChipRow>
              <Chip label="All categories" selected={categoryId == null} onPress={() => setCategoryId(null)} />
              {(data?.categories ?? []).map((category) => (
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
            <TransactionRow
              transaction={item}
              onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: item.id } })}
              onLongPress={() => handleDelete(item)}
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
