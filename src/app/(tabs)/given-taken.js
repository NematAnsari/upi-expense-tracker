// Given & Taken tab: the two totals, then people in "Given (n)" and "Taken (n)" tabs.
// Kept apart from the Expenses tab: none of this is spending or income.

import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '../../components/basics/Card';
import { ChoiceRow, FilterSheet } from '../../components/sections/FilterSheet';
import { ICONS } from '../../components/icons/icons';
import { PersonBalanceRow } from '../../components/rows/PersonBalanceRow';
import { SegmentedControl } from '../../components/basics/SegmentedControl';
import { EmptyState, ErrorState, LoadingState } from '../../components/basics/ScreenStates';
import { SearchFilterBar } from '../../components/sections/SearchFilterBar';
import { SwipeableRow } from '../../components/basics/SwipeableRow';
import { TotalTile } from '../../components/sections/TotalTile';
import { colors, fontSize, spacing } from '../../constants/theme';
import {
  BALANCE_TEXT,
  PEOPLE_SHOW,
  PEOPLE_SORTS,
  personLists,
  returnTypeFor,
  filterPeople,
  sortPeople,
} from '../../domain/people';
import { useFocusQuery } from '../../hooks/useFocusQuery';
import { formatINR } from '../../utils/money';
import { plural } from '../../utils/text';
import { getPeopleBalances } from '../../db/people';

const TABS = {
  given: { label: 'Given', empty: 'When you give money to someone, tap + on Money to receive above.' },
  taken: { label: 'Taken', empty: 'When you take money from someone, tap + on Money to return above.' },
};

// Icons for the Filters sheet rows.
const SHOW_ICONS = { all: ICONS.people, pending: ICONS.latest, settled: ICONS.settled };
const SORT_ICONS = { latest: ICONS.latest, largest: ICONS.largest, oldest: ICONS.oldest };
const SHOW_CHOICES = PEOPLE_SHOW.map((option) => ({ ...option, draw: SHOW_ICONS[option.value] }));
const SORT_CHOICES = PEOPLE_SORTS.map((option) => ({ ...option, draw: SORT_ICONS[option.value] }));

/** The tiles' last line: "Given today ₹500.00" or "Nothing today". */
function todayText(what, paise) {
  return paise > 0 ? `${what} today ${formatINR(paise)}` : 'Nothing today';
}

export default function GivenTakenScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [tab, setTab] = useState('given');
  const [search, setSearch] = useState('');
  const [showFilter, setShowFilter] = useState('all');
  const [sort, setSort] = useState('latest');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const loader = useCallback(() => getPeopleBalances(db), [db]);
  const { data, error, reload } = useFocusQuery(loader);

  function openPerson(balance) {
    router.push({ pathname: '/person/[name]', params: { name: balance.person } });
  }
  const openNewEntry = (loanType) => router.push({ pathname: '/transaction/new', params: { loanType } });
  // Same as the person page's main button: name and remaining amount filled in.
  const recordReturn = (balance) =>
    router.push({
      pathname: '/transaction/new',
      params: { loanType: returnTypeFor(balance.status), person: balance.person, amountPaise: balance.amountPaise },
    });

  function clearSheet() {
    setShowFilter('all');
    setSort('latest');
  }

  if (error) {
    return <ErrorState onRetry={reload} />;
  }
  if (!data) {
    return <LoadingState />;
  }

  const peopleInTab = (name) => data.people.filter((balance) => personLists(balance).includes(name));
  const tabPeople = peopleInTab(tab);
  // Matches any part of the name, ignoring case: "rah" finds Rahul and Sarah.
  const searchTerm = search.trim().toLowerCase();
  const shownPeople = sortPeople(
    filterPeople(tabPeople, showFilter).filter(
      (balance) => !searchTerm || balance.person.toLowerCase().includes(searchTerm),
    ),
    sort,
  );
  const filterCount = (showFilter === 'all' ? 0 : 1) + (sort === 'latest' ? 0 : 1);
  const tabOptions = Object.entries(TABS).map(([value, { label }]) => ({
    value,
    label: `${label} (${peopleInTab(value).length})`,
  }));

  function renderList() {
    if (tabPeople.length === 0) {
      return <EmptyState title="No one here yet" message={TABS[tab].empty} />;
    }
    if (shownPeople.length === 0 && searchTerm) {
      return (
        <EmptyState
          title="No one found"
          message={`No person matches "${search.trim()}".`}
          actionLabel="Clear search"
          onAction={() => setSearch('')}
        />
      );
    }
    if (shownPeople.length === 0) {
      return (
        <EmptyState
          title="No one found"
          message={showFilter === 'pending' ? 'Everyone here is fully settled.' : 'No one here is fully settled yet.'}
          actionLabel="Show everyone"
          onAction={() => setShowFilter('all')}
        />
      );
    }
    return (
      <Card>
        {shownPeople.map((balance, index) => (
          <View key={balance.person.toLowerCase()} style={index > 0 && styles.divider}>
            <SwipeableRow
              leftAction={
                balance.status === 'settled'
                  ? null
                  : { label: 'Record', color: colors.people, onPress: () => recordReturn(balance) }
              }
            >
              <PersonBalanceRow person={balance} onPress={openPerson} />
            </SwipeableRow>
          </View>
        ))}
      </Card>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.totals}>
        <TotalTile
          label={BALANCE_TEXT.toReceive}
          paise={data.toReceivePaise}
          direction="credit"
          action="Add money I gave"
          zeroText="Nothing to receive"
          subText={todayText('Given', data.givenTodayPaise)}
          onPress={() => openNewEntry('lent')}
        />
        <TotalTile
          label={BALANCE_TEXT.toReturn}
          paise={data.toReturnPaise}
          direction="debit"
          action="Add money I took"
          zeroText="Nothing to return"
          subText={todayText('Taken', data.takenTodayPaise)}
          onPress={() => openNewEntry('borrowed')}
        />
      </View>

      {data.people.length === 0 ? (
        <EmptyState
          title="Nothing recorded yet"
          message="Tap + on a box above when you give money to someone or take money from them."
        />
      ) : (
        <>
          <SegmentedControl options={tabOptions} value={tab} onChange={setTab} />
          <SearchFilterBar
            itemCount={data.people.length}
            search={search}
            onSearch={setSearch}
            placeholder="Search people by name"
            filterCount={filterCount}
            onOpenFilters={() => setFiltersOpen(true)}
          />
          <FilterSheet
            visible={filtersOpen}
            onClose={() => setFiltersOpen(false)}
            onClear={clearSheet}
            showLabel={`Show ${plural(shownPeople.length, 'person', 'people')}`}
          >
            <ChoiceRow label="Show" choices={SHOW_CHOICES} value={showFilter} onSelect={setShowFilter} />
            <ChoiceRow label="Sort by" choices={SORT_CHOICES} value={sort} onSelect={setSort} />
          </FilterSheet>
          {renderList()}
          {shownPeople.some((balance) => balance.status !== 'settled') ? (
            <Text style={styles.hint}>Tip: swipe a person right to record money received back or returned.</Text>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl },
  totals: { flexDirection: 'row', gap: spacing.md },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  hint: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' },
});
