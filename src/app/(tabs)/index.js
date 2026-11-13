// Expenses tab: Spent and Received tiles, a to-do card, shop accounts, then this month's
// expenses and income with All / Paid / Received tabs, search and Filters.

import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import {
  ChoiceRow,
  countFilters,
  FilterSheet,
  NO_FILTERS,
  PaymentFilters,
} from '../../components/sections/FilterSheet';
import { ICONS } from '../../components/icons/icons';
import { MonthSelector } from '../../components/sections/MonthSelector';
import { SegmentedControl } from '../../components/basics/SegmentedControl';
import { EmptyState, ErrorState, LoadingState } from '../../components/basics/ScreenStates';
import { TransactionListItem } from '../../components/rows/TransactionListItem';
import { SearchFilterBar } from '../../components/sections/SearchFilterBar';
import { ShopAccountRow } from '../../components/sections/ShopAccountCards';
import { TextLink } from '../../components/basics/TextLink';
import { TodoCard } from '../../components/sections/TodoCard';
import { TotalTile } from '../../components/sections/TotalTile';
import { TotalsLine } from '../../components/sections/TotalsLine';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { listAccounts } from '../../db/accounts';
import { countTransactions, getLastBackupAt } from '../../db/backup';
import { listCategories } from '../../db/categories';
import { countPendingDetected } from '../../db/detected';
import { getDashboardData } from '../../db/reports';
import { listShopAccounts } from '../../db/shopAccounts';
import { listTransactions } from '../../db/transactions';
import { groupRepeats } from '../../domain/repeats';
import { pickableCategories } from '../../domain/transactionForm';
import { useDeleteTransaction } from '../../hooks/useDeleteTransaction';
import { useFocusQuery } from '../../hooks/useFocusQuery';
import { getDaysSinceLastMessage, syncDetectedPayments } from '../../services/detection';
import { daysBetween, formatMonthLabel, getMonthKey, getMonthRange } from '../../utils/dates';
import { formatINR } from '../../utils/money';
import { plural } from '../../utils/text';

// A backup older than this many days is due again.
const BACKUP_EVERY_DAYS = 7;

/**
 * The backup reminder's title, or null when none is needed: nothing to back
 * up yet, or a backup file was made in the last week.
 */
function backupReminder(entryCount, lastBackupAt, now) {
  if (entryCount === 0) {
    return null;
  }
  if (lastBackupAt == null) {
    return 'No backup saved yet';
  }
  const days = daysBetween(lastBackupAt, now);
  return days >= BACKUP_EVERY_DAYS ? `Last backup ${days} days ago` : null;
}

const TABS = {
  all: { label: 'All', direction: null },
  paid: { label: 'Paid', direction: 'debit' },
  received: { label: 'Received', direction: 'credit' },
};

const SORTS = [
  { value: 'latest', label: 'Latest', draw: ICONS.latest },
  { value: 'largest', label: 'Largest', draw: ICONS.largest },
];

/** The tiles' last line in the current month: "Today ₹200.00" or "Nothing today". */
function todayText(paise) {
  return paise > 0 ? `Today ${formatINR(paise)}` : 'Nothing today';
}

export default function ExpensesScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [monthKey, setMonthKey] = useState(getMonthKey);
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('latest');
  const [paymentFilters, setPaymentFilters] = useState(NO_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const loader = useCallback(async () => {
    // Pick up payments captured while the app was closed before reading totals.
    await syncDetectedPayments(db);
    const month = getMonthRange(monthKey);
    const [dashboard, pendingCount, entries, categories, accounts, shopAccounts, quietDays, entryCount, lastBackupAt] =
      await Promise.all([
        getDashboardData(db, monthKey),
        countPendingDetected(db),
        // Expenses and income only (newest first); money given and taken has its own tab.
        listTransactions(db, { startMs: month.startMs, endMs: month.endMs, kind: 'regular' }),
        listCategories(db),
        listAccounts(db),
        listShopAccounts(db),
        getDaysSinceLastMessage(db),
        countTransactions(db),
        getLastBackupAt(db),
      ]);
    return {
      ...dashboard,
      pendingCount,
      entries,
      categories: pickableCategories(categories),
      accounts,
      shopAccounts,
      quietDays,
      // Today's totals only make sense while looking at the current month.
      isThisMonth: monthKey === getMonthKey(),
      backupTitle: backupReminder(entryCount, lastBackupAt, Date.now()),
    };
  }, [db, monthKey]);
  const { data, error, reload } = useFocusQuery(loader);
  const deleteWithConfirm = useDeleteTransaction(reload);

  // Kept the same between renders, so rows that did not change are not redrawn.
  const openTransaction = useCallback(
    (transaction) => router.push({ pathname: '/transaction/[id]', params: { id: transaction.id } }),
    [router],
  );
  const openNewEntry = (params) => router.push({ pathname: '/transaction/new', params });

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
    if (shownEntries.length === 0 && filterCount > 0) {
      return (
        <EmptyState
          title="Nothing found"
          message="No entries match these filters this month."
          actionLabel="Clear filters"
          onAction={() => setPaymentFilters(NO_FILTERS)}
        />
      );
    }
    if (shownEntries.length === 0) {
      return searchTerm ? (
        <EmptyState
          title="Nothing found"
          message={`Nothing matches "${search.trim()}" this month.`}
          actionLabel="Clear search"
          onAction={() => setSearch('')}
        />
      ) : (
        <EmptyState title="Nothing here yet" message={`No ${TABS[tab].label.toLowerCase()} entries this month.`} />
      );
    }
    return null;
  }

  // The rows look like one card: the first row has the top corners, the last the bottom ones.
  const renderRow = ({ item, index }) => (
    <View style={[styles.cardRow, index === 0 && styles.cardFirst, index === rows.length - 1 && styles.cardLast]}>
      <View style={index > 0 && styles.divider}>
        <TransactionListItem group={item} onEdit={openTransaction} onDelete={deleteWithConfirm} />
      </View>
    </View>
  );

  // Filtered on the phone, so typing in search is instant. The sheet's filters
  // come first, so the tab counts follow them.
  const filterCount = countFilters(paymentFilters);
  const filteredEntries = (data?.entries ?? []).filter(
    (entry) =>
      (paymentFilters.categoryId == null || entry.categoryId === paymentFilters.categoryId) &&
      (paymentFilters.paymentMethod == null || entry.paymentMethod === paymentFilters.paymentMethod) &&
      (paymentFilters.accountId == null || entry.accountId === paymentFilters.accountId),
  );
  // Tapping the selected choice again clears that filter.
  const toggleFilter = (key, value) =>
    setPaymentFilters((current) => ({ ...current, [key]: current[key] === value ? null : value }));
  function clearSheet() {
    setPaymentFilters(NO_FILTERS);
    setSort('latest');
  }
  const entriesInTab = (name) =>
    TABS[name].direction
      ? filteredEntries.filter((entry) => entry.direction === TABS[name].direction)
      : filteredEntries;
  // Matches any part of the name or purpose, ignoring case.
  const searchTerm = search.trim().toLowerCase();
  const shownEntries = entriesInTab(tab).filter(
    (entry) =>
      !searchTerm ||
      (entry.merchant ?? '').toLowerCase().includes(searchTerm) ||
      (entry.purpose ?? '').toLowerCase().includes(searchTerm),
  );
  // Repeat purchases (same name, category and day) share one row. Entries come newest
  // first; Largest orders by the row's total (newest first on a tie).
  const grouped = groupRepeats(shownEntries);
  const rows = sort === 'largest' ? [...grouped].sort((a, b) => b.totalPaise - a.totalPaise) : grouped;
  const tabOptions = Object.entries(TABS).map(([value, { label }]) => ({
    value,
    label: `${label} (${entriesInTab(value).length})`,
  }));
  const shownCountText = plural(shownEntries.length, 'entry', 'entries');
  const quietText = `No bank SMS read for ${data?.quietDays} days`;

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
              subText={data.isThisMonth ? todayText(data.todayTotals.totalPaise) : null}
              subCount={data.todayTotals.count}
              onPress={() => openNewEntry({})}
            />
            <TotalTile
              label="Received"
              count={data.receivedTotals.count}
              paise={data.receivedTotals.totalPaise}
              direction="credit"
              action="Add income"
              zeroText="Nothing received"
              subText={data.isThisMonth ? todayText(data.todayReceived.totalPaise) : null}
              subCount={data.todayReceived.count}
              onPress={() => openNewEntry({ direction: 'credit' })}
            />
          </View>

          {/* Review comes first: those payments are not counted until added. */}
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
              // No bank message for days: Android may have stopped the reader.
              data.quietDays != null && {
                key: 'detection',
                icon: 'detection',
                title: quietText,
                action: 'Check',
                message: `${quietText}. Payment detection may have stopped`,
                onPress: () => router.push('/payment-detection'),
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
              data.backupTitle && {
                key: 'backup',
                icon: 'backup',
                title: data.backupTitle,
                action: 'Back up',
                message: data.backupTitle,
                onPress: () => router.push('/backup'),
              },
            ].filter(Boolean)}
          />

          {/* Shops where you take now and pay later (More → Shop accounts). */}
          {data.shopAccounts.map((account) => (
            <ShopAccountRow
              key={account.id}
              account={account}
              onChanged={reload}
              onOpenStatement={() => router.push({ pathname: '/shops/[id]', params: { id: account.id } })}
            />
          ))}

          {data.entries.length > 0 ? (
            <>
              <SegmentedControl options={tabOptions} value={tab} onChange={setTab} />
              <SearchFilterBar
                itemCount={filteredEntries.length}
                search={search}
                onSearch={setSearch}
                placeholder="Search by name or purpose"
                filterCount={filterCount + (sort === 'latest' ? 0 : 1)}
                onOpenFilters={() => setFiltersOpen(true)}
              />
              {filterCount > 0 ? <TotalsLine entries={shownEntries} countText={shownCountText} /> : null}
              <FilterSheet
                visible={filtersOpen}
                onClose={() => setFiltersOpen(false)}
                onClear={clearSheet}
                showLabel={`Show ${shownCountText}`}
              >
                <ChoiceRow label="Sort by" choices={SORTS} value={sort} onSelect={setSort} />
                <PaymentFilters
                  filters={paymentFilters}
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
      {shownEntries.length > 0 ? (
        <Text style={styles.hint}>Tip: swipe a row right to edit it, or left to delete it.</Text>
      ) : null}
      {data.entries.length > 0 ? (
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
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  hint: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' },
  viewAll: { alignItems: 'center' },
});
