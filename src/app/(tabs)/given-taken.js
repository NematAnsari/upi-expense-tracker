// Given & Taken tab: the totals, I gave money / I took money, and the people
// list with two tabs on top: Money given (people you gave money to) and Money
// taken (people you took money from). Each row says whether the remaining
// amount is to receive or to return, and since when; fully settled people come last.
// Tap a person to open their page. Swipe a person right to record money
// received back or returned. With 6 or more people a search box filters by name.
// Filters opens a sheet: show all / pending / settled, and sort order.
// Kept apart from the Expenses tab: none of this is spending or income.

import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '../../components/Card';
import { ChoiceRow, FilterButton, FilterSheet } from '../../components/FilterSheet';
import { ICONS } from '../../components/icons';
import { PersonBalanceRow } from '../../components/PersonBalanceRow';
import { SegmentedControl } from '../../components/SegmentedControl';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { SwipeableRow } from '../../components/SwipeableRow';
import { TextField } from '../../components/TextField';
import { TotalTile } from '../../components/TotalTile';
import { colors, fontSize, spacing } from '../../constants/theme';
import { getLoanBalances } from '../../db/reports';
import {
  BALANCE_TEXT,
  PEOPLE_SHOW,
  PEOPLE_SORTS,
  personLists,
  repaymentFor,
  showPeople,
  sortPeople,
} from '../../domain/loans';
import { useFocusQuery } from '../../hooks/useFocusQuery';
import { formatINR } from '../../utils/money';

// Below this many people the whole list fits on a screen, so no search box is shown.
const SEARCH_FROM = 6;

const LISTS = {
  given: { label: 'Given', empty: 'When you give money to someone, tap + on Money to receive above.' },
  taken: { label: 'Taken', empty: 'When you take money from someone, tap + on Money to return above.' },
};

// Icons for the Filters sheet rows.
const SHOW_ICONS = { all: ICONS.people, pending: ICONS.latest, settled: ICONS.settled };
const SORT_ICONS = { latest: ICONS.latest, largest: ICONS.largest, oldest: ICONS.oldest };
const SHOW_CHOICES = PEOPLE_SHOW.map((option) => ({ ...option, draw: SHOW_ICONS[option.value] }));
const SORT_CHOICES = PEOPLE_SORTS.map((option) => ({ ...option, draw: SORT_ICONS[option.value] }));

/** "1 person", "3 people" */
function peopleCount(count) {
  return `${count} ${count === 1 ? 'person' : 'people'}`;
}

/** The tiles' last line: "Given today ₹500.00" or "Nothing today". */
function todayText(what, paise) {
  return paise > 0 ? `${what} today ${formatINR(paise)}` : 'Nothing today';
}

export default function GivenTakenScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [list, setList] = useState('given');
  const [search, setSearch] = useState('');
  const [show, setShow] = useState('all');
  const [sort, setSort] = useState('latest');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const loader = useCallback(() => getLoanBalances(db), [db]);
  const { data, error, reload } = useFocusQuery(loader);

  function openPerson(person) {
    router.push({ pathname: '/loan/[person]', params: { person: person.person } });
  }
  const addLoan = (loanType) => router.push({ pathname: '/transaction/new', params: { loanType } });
  // Same as the person page's main button: name and remaining amount filled in.
  const recordReturn = (person) =>
    router.push({
      pathname: '/transaction/new',
      params: { loanType: repaymentFor(person.status), person: person.person, amountPaise: person.amountPaise },
    });

  function clearSheet() {
    setShow('all');
    setSort('latest');
  }

  if (error) {
    return <ErrorState onRetry={reload} />;
  }
  if (!data) {
    return <LoadingState />;
  }

  const inList = (name) => data.people.filter((person) => personLists(person).includes(name));
  // Matches any part of the name, ignoring case: "rah" finds Rahul and Sarah.
  const term = search.trim().toLowerCase();
  const people = sortPeople(
    showPeople(inList(list), show).filter((person) => !term || person.person.toLowerCase().includes(term)),
    sort,
  );
  const filterCount = (show === 'all' ? 0 : 1) + (sort === 'latest' ? 0 : 1);
  const options = Object.entries(LISTS).map(([value, { label }]) => ({
    value,
    label: `${label} (${inList(value).length})`,
  }));

  function renderList() {
    if (inList(list).length === 0) {
      return <EmptyState title="No one here yet" message={LISTS[list].empty} />;
    }
    if (people.length === 0 && term) {
      return (
        <EmptyState
          title="No one found"
          message={`No person matches "${search.trim()}".`}
          actionLabel="Clear search"
          onAction={() => setSearch('')}
        />
      );
    }
    if (people.length === 0) {
      return (
        <EmptyState
          title="No one found"
          message={show === 'pending' ? 'Everyone here is fully settled.' : 'No one here is fully settled yet.'}
          actionLabel="Show everyone"
          onAction={() => setShow('all')}
        />
      );
    }
    return (
      <Card>
        {people.map((person, index) => (
          <View key={person.person.toLowerCase()} style={index > 0 && styles.divider}>
            <SwipeableRow
              leftAction={
                person.status === 'settled'
                  ? null
                  : { label: 'Record', color: colors.people, onPress: () => recordReturn(person) }
              }
            >
              <PersonBalanceRow person={person} onPress={openPerson} />
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
          label={BALANCE_TEXT.owesYou}
          paise={data.owedToYouPaise}
          direction="credit"
          action="Add money I gave"
          zeroText="Nothing to receive"
          subText={todayText('Given', data.givenTodayPaise)}
          onPress={() => addLoan('lent')}
        />
        <TotalTile
          label={BALANCE_TEXT.youOwe}
          paise={data.youOwePaise}
          direction="debit"
          action="Add money I took"
          zeroText="Nothing to return"
          subText={todayText('Taken', data.takenTodayPaise)}
          onPress={() => addLoan('borrowed')}
        />
      </View>

      {data.people.length === 0 ? (
        <EmptyState
          title="Nothing recorded yet"
          message="Tap + on a box above when you give money to someone or take money from them."
        />
      ) : (
        <>
          <SegmentedControl options={options} value={list} onChange={setList} />
          <View style={styles.searchLine}>
            {data.people.length >= SEARCH_FROM ? (
              <TextField
                value={search}
                onChangeText={setSearch}
                placeholder="Search people by name"
                returnKeyType="search"
                autoCorrect={false}
                accessibilityLabel="Search people by name"
                style={styles.search}
              />
            ) : null}
            <FilterButton count={filterCount} onPress={() => setFiltersOpen(true)} />
          </View>
          <FilterSheet
            visible={filtersOpen}
            onClose={() => setFiltersOpen(false)}
            onClear={clearSheet}
            showLabel={`Show ${peopleCount(people.length)}`}
          >
            <ChoiceRow label="Show" choices={SHOW_CHOICES} value={show} onSelect={setShow} />
            <ChoiceRow label="Sort by" choices={SORT_CHOICES} value={sort} onSelect={setSort} />
          </FilterSheet>
          {renderList()}
          {people.some((person) => person.status !== 'settled') ? (
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
  // Search on the left, Filters on the right (alone on the right when there is no search box).
  searchLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.sm },
  search: { flex: 1 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  hint: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' },
});
