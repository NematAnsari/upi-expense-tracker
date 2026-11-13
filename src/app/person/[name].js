// One person's money given and taken: their card, round actions, a Summary,
// and a statement of every entry (oldest first) with what was left after each.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Amount } from '../../components/basics/Amount';
import { Button } from '../../components/basics/Button';
import { Card } from '../../components/basics/Card';
import { EmptyState, ErrorState, LoadingState } from '../../components/basics/ScreenStates';
import { TextField } from '../../components/basics/TextField';
import { PersonIcon } from '../../components/sections/PersonIcon';
import { PersonStatementHeader, PersonStatementRow } from '../../components/sections/PersonStatementRow';
import { PersonSummaryCard } from '../../components/sections/PersonSummaryCard';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { getPeopleBalances, renamePerson } from '../../db/people';
import { listTransactions } from '../../db/transactions';
import {
  dueText,
  LEFT_TEXT,
  leftText,
  personKey,
  personSummary,
  reminderMessage,
  remainingAfterEach,
  returnTypeFor,
  timelineText,
} from '../../domain/people';
import { useDeleteTransaction } from '../../hooks/useDeleteTransaction';
import { useFocusQuery } from '../../hooks/useFocusQuery';
import { showError, showMessage } from '../../utils/notify';
import { cleanName, initials, plural } from '../../utils/text';

const sameName = (a, b) => personKey(a) === personKey(b);

/** A round action button with a symbol and a small label; `primary` fills it teal. */
function RoundAction({ label, symbol, primary, onPress }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.roundAction}>
      <View style={[styles.roundCircle, primary && styles.roundCirclePrimary]}>
        <Text style={[styles.roundSymbol, primary && styles.roundSymbolPrimary]}>{symbol}</Text>
      </View>
      <Text style={styles.roundLabel}>{label}</Text>
    </Pressable>
  );
}

export default function PersonScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  // The person's name, from the address (/person/Rahul).
  const { name: personName } = useLocalSearchParams();
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [nameError, setNameError] = useState(null);

  const loader = useCallback(async () => {
    const [balances, entries] = await Promise.all([
      getPeopleBalances(db),
      listTransactions(db, { loansOnly: true, person: personName }),
    ]);
    const balance = balances.people.find((candidate) => sameName(candidate.person, personName)) ?? null;
    return { balance, entries, people: balances.people };
  }, [db, personName]);
  const { data, error, reload } = useFocusQuery(loader);
  const deleteWithConfirm = useDeleteTransaction(reload);

  function openNewEntry(loanType, amountPaise) {
    const params = { loanType, person: data?.balance?.person ?? personName };
    if (amountPaise) {
      params.amountPaise = amountPaise;
    }
    router.push({ pathname: '/transaction/new', params });
  }

  async function sendReminder() {
    try {
      await Share.share({ message: reminderMessage(data.balance) });
    } catch (shareError) {
      showError('Could not open sharing', shareError);
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
      router.replace({ pathname: '/person/[name]', params: { name: cleanName(name) } });
    } catch (renameError) {
      showError('Could not rename', renameError);
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
    const existingPerson = data.people.find(
      (candidate) => sameName(candidate.person, name) && !sameName(candidate.person, data.balance.person),
    );
    if (!existingPerson) {
      applyRename(name);
      return;
    }
    Alert.alert(
      `Combine with ${existingPerson.person}?`,
      `${existingPerson.person} is already in your list. All entries with ${data.balance.person} will move to ${existingPerson.person}, and the two will show as one person.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Combine', onPress: () => applyRename(existingPerson.person) },
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
  if (!balance) {
    return (
      <EmptyState
        title="Nothing recorded with this person"
        message="Their entries may have been deleted or renamed."
        actionLabel="Go back"
        onAction={() => router.back()}
      />
    );
  }

  const settled = balance.status === 'settled';
  const statusColor = settled ? colors.success : colors.warning;
  const returnType = returnTypeFor(balance.status);
  const remainingAfter = remainingAfterEach(entries);
  const timeline = timelineText(balance);
  const due = dueText(balance);
  const summary = personSummary(balance, entries);
  // Oldest first, like a passbook. Entries arrive newest first.
  const statement = [...entries].reverse();

  return (
    // Keeps the rename box above the keyboard.
    <KeyboardAwareScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      bottomOffset={spacing.xl}
    >
      <Card>
        <View style={styles.nameRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(balance.person)}</Text>
          </View>
          <View style={styles.nameBlock}>
            <Text style={styles.name} numberOfLines={2}>
              {balance.person}
            </Text>
            <View style={[styles.tag, settled ? styles.tagSettled : styles.tagPending]}>
              <PersonIcon name={settled ? 'tick' : 'clock'} size={12} color={statusColor} />
              <Text style={[styles.tagText, { color: statusColor }]}>{settled ? 'Settled' : 'Pending'}</Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Rename"
            onPress={startRename}
            hitSlop={8}
            style={({ pressed }) => [styles.pencil, pressed && styles.pressed]}
          >
            <PersonIcon name="pencil" size={16} />
          </Pressable>
        </View>

        <View style={styles.hero} accessible accessibilityLabel={timeline?.spoken}>
          {settled ? (
            <Text style={styles.heroSettled}>Fully settled</Text>
          ) : (
            <>
              <Amount
                paise={balance.amountPaise}
                direction={balance.status === 'toReceive' ? 'credit' : 'debit'}
                size="xxl"
              />
              <Text style={styles.muted}>{LEFT_TEXT[balance.status]}</Text>
            </>
          )}
          {timeline ? <Text style={styles.heroDate}>{`${timeline.date} · ${timeline.duration}`}</Text> : null}
          {due ? <Text style={[styles.heroDue, due.overdue && styles.overdue]}>{due.text}</Text> : null}
        </View>

        {/* Always two totals side by side; a side with nothing yet shows a grey ₹0. */}
        <View style={styles.tiles}>
          {summary.pair.map((part) => (
            <View key={part.label} style={styles.tile}>
              <Text style={styles.muted}>{part.label}</Text>
              {part.paise > 0 ? (
                <Amount paise={part.paise} direction={part.direction} />
              ) : (
                <Text style={styles.zero}>₹0</Text>
              )}
            </View>
          ))}
        </View>
      </Card>

      <View style={styles.roundActions}>
        {returnType ? (
          <RoundAction
            label="Record"
            symbol="+"
            primary
            onPress={() => openNewEntry(returnType, balance.amountPaise)}
          />
        ) : null}
        {balance.status === 'toReceive' ? <RoundAction label="Remind" symbol="✉" onPress={sendReminder} /> : null}
        <RoundAction label="Gave more" symbol="↗" onPress={() => openNewEntry('lent')} />
        <RoundAction label="Took more" symbol="↙" onPress={() => openNewEntry('borrowed')} />
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
            <Text style={styles.muted}>
              Changes the name on all {plural(entries.length, 'entry', 'entries')} with this person. Type the name of
              someone already in your list to combine the two.
            </Text>
            <View style={styles.renameButtons}>
              <Button label="Cancel" variant="secondary" onPress={() => setRenaming(false)} style={styles.flex} />
              <Button label="Save" onPress={saveRename} style={styles.flex} />
            </View>
          </View>
        </Card>
      ) : null}

      <PersonSummaryCard summary={summary} />

      <Card title="Statement">
        <PersonStatementHeader />
        {statement.map((entry) => (
          <PersonStatementRow
            key={entry.id}
            entry={entry}
            remainingText={leftText(remainingAfter[entry.id])}
            onEdit={() => router.push({ pathname: '/transaction/[id]', params: { id: entry.id } })}
            onDelete={() => deleteWithConfirm(entry)}
          />
        ))}
      </Card>
      <Text style={styles.hint}>Tip: swipe a statement row right to edit it, or left to delete it.</Text>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl },
  flex: { flex: 1 },
  pressed: { opacity: 0.6 },
  muted: { fontSize: fontSize.sm, color: colors.textMuted },
  heroDue: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textMuted },
  overdue: { color: colors.danger },
  zero: { fontSize: fontSize.md, fontWeight: '600', color: colors.textMuted },
  error: { fontSize: fontSize.sm, color: colors.danger },
  hint: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' },
  // The card: name row, amount, two totals.
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.peopleSoft,
  },
  avatarText: { fontSize: fontSize.md, fontWeight: '700', color: colors.people },
  nameBlock: { flex: 1, gap: spacing.xs },
  name: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  tagPending: { backgroundColor: colors.warningSoft },
  tagSettled: { backgroundColor: colors.incomeSoft },
  tagText: { fontSize: fontSize.xs, fontWeight: '700' },
  pencil: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  hero: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.lg },
  heroSettled: { fontSize: fontSize.xl, fontWeight: '700', color: colors.success },
  heroDate: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  tiles: { flexDirection: 'row', gap: spacing.md },
  tile: { flex: 1, gap: 2, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.background },
  // Round actions.
  roundActions: { flexDirection: 'row', justifyContent: 'space-around' },
  roundAction: { alignItems: 'center', gap: spacing.xs, minWidth: 64 },
  roundCircle: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  roundCirclePrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  roundSymbol: { fontSize: fontSize.lg, color: colors.primary },
  roundSymbolPrimary: { color: colors.onPrimary },
  roundLabel: { fontSize: fontSize.xs, color: colors.text },
  // Rename.
  renameBody: { gap: spacing.md },
  renameButtons: { flexDirection: 'row', gap: spacing.md },
});
