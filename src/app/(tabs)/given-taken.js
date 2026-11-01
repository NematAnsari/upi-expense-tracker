// Given & Taken tab: the totals, I gave money / I took money, and the people
// list with two tabs on top: Money given (people you gave money to) and Money
// taken (people you took money from). Each row says whether the remaining
// amount is to receive or to return, and since when; fully settled people come last.
// Tap a person to open their page. Swipe a person right to record money
// received back or returned. With 6 or more people a search box filters by name.
// Kept apart from the Expenses tab: none of this is spending or income.

import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '../../components/Card';
import { Chip } from '../../components/Chip';
import { ChipRow } from '../../components/ChipRow';
import { PersonBalanceRow } from '../../components/PersonBalanceRow';
import { SegmentedControl } from '../../components/SegmentedControl';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { SwipeableRow } from '../../components/SwipeableRow';
import { TextField } from '../../components/TextField';
import { TotalTile } from '../../components/TotalTile';
import { colors, fontSize, spacing } from '../../constants/theme';
import { getLoanBalances } from '../../db/reports';
import { BALANCE_TEXT, PEOPLE_SORTS, personLists, repaymentFor, sortPeople } from '../../domain/loans';
import { useFocusQuery } from '../../hooks/useFocusQuery';

// Below this many people the whole list fits on a screen, so no search box is shown.
const SEARCH_FROM = 6;

const LISTS = {
  given: { label: 'Given', empty: 'When you give money to someone, tap + on Money to receive above.' },
  taken: { label: 'Taken', empty: 'When you take money from someone, tap + on Money to return above.' },
};

/** "1 person", "3 people" */
function peopleCount(count) {
  return `${count} ${count === 1 ? 'person' : 'people'}`;
}

export default function GivenTakenScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [list, setList] = useState('given');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('all');
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

  if (error) {
    return <ErrorState onRetry={reload} />;
  }
  if (!data) {
    return <LoadingState />;
  }

  const inList = (name) => data.people.filter((person) => personLists(person).includes(name));
  const byStatus = (status) => data.people.filter((person) => person.status === status);
  // Matches any part of the name, ignoring case: "rah" finds Rahul and Sarah.
  const term = search.trim().toLowerCase();
  const people = sortPeople(
    inList(list).filter((person) => !term || person.person.toLowerCase().includes(term)),
    sort,
  );
  const options = Object.entries(LISTS).map(([value, { label }]) => ({
    value,
    label: `${label} (${inList(value).length})`,
  }));

  function renderList() {
    if (inList(list).length === 0) {
      return <EmptyState title="No one here yet" message={LISTS[list].empty} />;
    }
    if (people.length === 0) {
      return (
        <EmptyState
          title="No one found"
          message={`No person matches "${search.trim()}".`}
          actionLabel="Clear search"
          onAction={() => setSearch('')}
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
          subText={`from ${peopleCount(byStatus('owesYou').length)}`}
          onPress={() => addLoan('lent')}
        />
        <TotalTile
          label={BALANCE_TEXT.youOwe}
          paise={data.youOwePaise}
          direction="debit"
          action="Add money I took"
          zeroText="Nothing to return"
          subText={`to ${peopleCount(byStatus('youOwe').length)}`}
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
          {data.people.length >= SEARCH_FROM ? (
            <TextField
              value={search}
              onChangeText={setSearch}
              placeholder="Search people by name"
              returnKeyType="search"
              autoCorrect={false}
              accessibilityLabel="Search people by name"
            />
          ) : null}
          <ChipRow>
            {PEOPLE_SORTS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={sort === option.value}
                onPress={() => setSort(option.value)}
              />
            ))}
          </ChipRow>
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
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  hint: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' },
});
