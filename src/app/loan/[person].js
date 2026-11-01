// One person's money given and taken: how much was given or taken, how much
// came back, the remaining amount, a button to record money received back or
// returned (name and remaining amount filled in), and every entry with them.
// Each entry shows what was left after it. Swipe an entry right to edit it or
// left to delete it. You can also send a reminder or rename (merge) the person.

import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Amount } from '../../components/Amount';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { STATUS_COLORS, StatusIcon } from '../../components/StatusIcon';
import { SwipeableTransactionRow } from '../../components/SwipeableTransactionRow';
import { TextField } from '../../components/TextField';
import { TextLink } from '../../components/TextLink';
import { colors, fontSize, spacing } from '../../constants/theme';
import { getLoanBalances } from '../../db/reports';
import { listTransactions, renamePerson } from '../../db/transactions';
import {
  BALANCE_TEXT,
  balanceParts,
  describeNet,
  reminderMessage,
  repaymentFor,
  runningRemaining,
  timelineText,
} from '../../domain/loans';
import { useDeleteTransaction } from '../../hooks/useDeleteTransaction';
import { useFocusQuery } from '../../hooks/useFocusQuery';
import { showMessage } from '../../ui/notify';

const RECORD_LABEL = {
  lent_repaid: 'Record money received back',
  borrowed_repaid: 'Record money returned',
};

const sameName = (a, b) => a.trim().toLowerCase().replace(/\s+/g, ' ') === b.trim().toLowerCase().replace(/\s+/g, ' ');

export default function LoanPersonScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { person } = useLocalSearchParams();
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [nameError, setNameError] = useState(null);

  const loader = useCallback(async () => {
    const [balances, entries] = await Promise.all([
      getLoanBalances(db),
      listTransactions(db, { loansOnly: true, person }),
    ]);
    const balance = balances.people.find((candidate) => sameName(candidate.person, person)) ?? null;
    return { balance, entries, people: balances.people };
  }, [db, person]);
  const { data, error, reload } = useFocusQuery(loader);
  const deleteWithConfirm = useDeleteTransaction(reload);

  function addEntry(loanType, amountPaise) {
    const params = { loanType, person: data?.balance?.person ?? person };
    if (amountPaise) {
      params.amountPaise = amountPaise;
    }
    router.push({ pathname: '/transaction/new', params });
  }

  async function sendReminder() {
    try {
      await Share.share({ message: reminderMessage(data.balance) });
    } catch (shareError) {
      console.error(shareError);
      Alert.alert('Could not open sharing', shareError.message || 'Please try again.');
    }
  }

  function startRename() {
    setNewName(data.balance.person);
    setNameError(null);
    setRenaming(true);
  }

  async function applyRename(name) {
    try {
      await renamePerson(db, data.balance.person, name);
      setRenaming(false);
      showMessage('Name updated');
      // The page is keyed by name, so open it again under the new one.
      router.replace({ pathname: '/loan/[person]', params: { person: name.trim().replace(/\s+/g, ' ') } });
    } catch (renameError) {
      console.error(renameError);
      Alert.alert('Could not rename', renameError.message || 'Please try again.');
    }
  }

  function saveRename() {
    const name = newName.trim();
    if (!name) {
      setNameError('Enter a name.');
      return;
    }
    if (name === data.balance.person) {
      setRenaming(false);
      return;
    }
    // A name that already belongs to someone else combines both people.
    const other = data.people.find(
      (candidate) => sameName(candidate.person, name) && !sameName(candidate.person, data.balance.person),
    );
    if (!other) {
      applyRename(name);
      return;
    }
    Alert.alert(
      `Combine with ${other.person}?`,
      `${other.person} is already in your list. All entries with ${data.balance.person} will move to ${other.person}, and the two will show as one person.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Combine', onPress: () => applyRename(other.person) },
      ],
    );
  }

  if (error) {
    return <ErrorState onRetry={reload} />;
  }
  if (!data) {
    return <LoadingState />;
  }

  const { balance, entries } = data;
  const header = <Stack.Screen options={{ title: balance?.person ?? person }} />;
  if (!balance) {
    return (
      <>
        {header}
        <EmptyState
          title="Nothing recorded with this person"
          message="Their entries may have been deleted or renamed."
          actionLabel="Go back"
          onAction={() => router.back()}
        />
      </>
    );
  }

  const settled = balance.status === 'settled';
  const repayment = repaymentFor(balance.status);
  const remainingAfter = runningRemaining(entries);
  const timeline = timelineText(balance);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {header}
      <Card>
        {balanceParts(balance).map((part) => (
          <View key={part.label} style={styles.line}>
            <Text style={styles.lineLabel}>{part.label}</Text>
            <Amount paise={part.paise} direction={part.direction} bold={false} />
          </View>
        ))}
        <View style={[styles.line, styles.remaining]}>
          <View>
            <Text style={styles.lineLabel}>Remaining amount</Text>
            <Text style={styles.status}>{BALANCE_TEXT[balance.status]}</Text>
          </View>
          {settled ? (
            <Text style={styles.settled}>✓</Text>
          ) : (
            <Amount
              paise={balance.amountPaise}
              direction={balance.status === 'owesYou' ? 'credit' : 'debit'}
              size="xl"
            />
          )}
        </View>
        {timeline ? (
          <View style={styles.timelineRow} accessible accessibilityLabel={timeline.spoken}>
            <StatusIcon status={timeline.status} />
            <Text style={styles.timeline}>{timeline.date}</Text>
            <Text style={[styles.duration, { color: STATUS_COLORS[timeline.status] }]}>{timeline.duration}</Text>
          </View>
        ) : null}
      </Card>

      {repayment ? (
        <Button label={RECORD_LABEL[repayment]} onPress={() => addEntry(repayment, balance.amountPaise)} />
      ) : null}
      {balance.status === 'owesYou' ? (
        <Button label="Send a reminder" variant="secondary" onPress={sendReminder} />
      ) : null}
      <View style={styles.links}>
        <TextLink label="I gave more" onPress={() => addEntry('lent')} />
        <TextLink label="I took more" onPress={() => addEntry('borrowed')} />
        <TextLink label="Rename" onPress={startRename} muted />
      </View>

      {renaming ? (
        <Card title="Rename or combine">
          <View style={styles.renameBody}>
            <TextField
              value={newName}
              onChangeText={(text) => {
                setNewName(text);
                setNameError(null);
              }}
              placeholder="Person's name"
              maxLength={80}
              autoFocus
              error={nameError}
              accessibilityLabel="New name"
            />
            {nameError ? <Text style={styles.error}>{nameError}</Text> : null}
            <Text style={styles.renameNote}>
              Changes the name on all {entries.length} {entries.length === 1 ? 'entry' : 'entries'} with this person.
              Type the name of someone already in your list to combine the two.
            </Text>
            <View style={styles.renameButtons}>
              <Button label="Cancel" variant="secondary" onPress={() => setRenaming(false)} style={styles.flex} />
              <Button label="Save" onPress={saveRename} style={styles.flex} />
            </View>
          </View>
        </Card>
      ) : null}

      <Card title="History">
        {entries.map((item, index) => (
          <View key={item.id} style={index > 0 && styles.divider}>
            <SwipeableTransactionRow
              transaction={item}
              note={`→ ${describeNet(remainingAfter[item.id])}`}
              onEdit={() => router.push({ pathname: '/transaction/[id]', params: { id: item.id } })}
              onDelete={deleteWithConfirm}
            />
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  lineLabel: { fontSize: fontSize.md, color: colors.text },
  remaining: {
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  status: { fontSize: fontSize.sm, fontWeight: '600', color: colors.people },
  settled: { fontSize: fontSize.xl, fontWeight: '700', color: colors.textMuted },
  timelineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  timeline: { flex: 1, fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  duration: { fontSize: fontSize.md, fontWeight: '700' },
  links: { flexDirection: 'row', justifyContent: 'space-around' },
  renameBody: { gap: spacing.md },
  renameNote: { fontSize: fontSize.sm, color: colors.textMuted },
  renameButtons: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
  error: { fontSize: fontSize.sm, color: colors.danger },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
