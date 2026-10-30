// Loans: who owes you money and whom you owe, from everything marked as
// Lent, Borrowed, Paid back or Got paid back. Tap a person to see their entries.

import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Amount } from '../components/Amount';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { getLoanBalances } from '../db/reports';
import { useFocusQuery } from '../hooks/useFocusQuery';
import { formatDate } from '../utils/dates';

const STATUS = {
  owesYou: { text: 'owes you', direction: 'credit' },
  youOwe: { text: 'you owe', direction: 'debit' },
  settled: { text: 'settled', direction: null },
};

function PersonRow({ person, onPress }) {
  const status = STATUS[person.status];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Shows all loan entries with this person"
      onPress={() => onPress(person)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.main}>
        <Text style={styles.name} numberOfLines={1}>
          {person.person}
        </Text>
        <Text style={styles.meta}>
          {person.count} {person.count === 1 ? 'entry' : 'entries'} · last on {formatDate(person.lastAt)}
        </Text>
      </View>
      <View style={styles.balance}>
        <Text style={styles.statusText}>{status.text}</Text>
        {status.direction ? (
          <Amount paise={person.amountPaise} direction={status.direction} size="lg" />
        ) : (
          <Text style={styles.settled}>✓</Text>
        )}
      </View>
    </Pressable>
  );
}

export default function LoansScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const loader = useCallback(() => getLoanBalances(db), [db]);
  const { data, error, reload } = useFocusQuery(loader);

  // Runs only when a person is tapped. `at` makes each tap a new navigation,
  // so History applies the search every time.
  function openPerson(person) {
    router.navigate({ pathname: '/history', params: { filter: 'loans', search: person.person, at: Date.now() } });
  }
  const addLoan = () => router.push({ pathname: '/transaction/new', params: { loanType: 'lent' } });

  if (error) {
    return <ErrorState onRetry={reload} />;
  }
  if (!data) {
    return <LoadingState />;
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={data.people}
      keyExtractor={(person) => person.person.toLowerCase()}
      ListHeaderComponent={
        <View style={styles.header}>
          <Card>
            <View style={styles.totals}>
              <View style={styles.total}>
                <Text style={styles.label}>Others owe you</Text>
                <Amount paise={data.owedToYouPaise} direction="credit" size="xl" />
              </View>
              <View style={styles.total}>
                <Text style={styles.label}>You owe</Text>
                <Amount paise={data.youOwePaise} direction="debit" size="xl" />
              </View>
            </View>
            <Text style={styles.note}>
              Loans are not counted as spending or income. Mark a payment as Lent, Borrowed, Paid back or Got paid back
              when you add it.
            </Text>
          </Card>
          <Button label="+ Add money lent or borrowed" variant="secondary" onPress={addLoan} />
        </View>
      }
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      renderItem={({ item }) => <PersonRow person={item} onPress={openPerson} />}
      ListEmptyComponent={
        <EmptyState
          title="No loans yet"
          message="When you lend or borrow money, choose Lent or Borrowed in “What is this?”."
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  header: { gap: spacing.lg, marginBottom: spacing.md },
  totals: { flexDirection: 'row', gap: spacing.lg },
  total: { flex: 1, gap: spacing.xs },
  label: { fontSize: fontSize.sm, color: colors.textMuted },
  note: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
  },
  pressed: { opacity: 0.6 },
  main: { flex: 1, gap: 2 },
  name: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  meta: { fontSize: fontSize.sm, color: colors.textMuted },
  balance: { alignItems: 'flex-end', gap: 2 },
  statusText: { fontSize: fontSize.sm, color: colors.textMuted },
  settled: { fontSize: fontSize.lg, fontWeight: '700', color: colors.textMuted },
  separator: { height: spacing.sm },
});
