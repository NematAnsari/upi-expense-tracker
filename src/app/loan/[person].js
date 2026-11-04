// One person's money given and taken:
//   a card with their name (initials, Pending / Settled tag, pencil to rename),
//   the remaining amount with the date and time open, and the two totals;
//   round actions (Record, Remind, Gave more, Took more); a Summary with a
//   ring of how much has come back; and a statement of every entry, oldest
//   first, with what was left after each. Swipe a statement row right to edit
//   it or left to delete it.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { Amount } from '../../components/Amount';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { SwipeableRow } from '../../components/SwipeableRow';
import { TextField } from '../../components/TextField';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { getLoanBalances } from '../../db/reports';
import { listTransactions, renamePerson } from '../../db/transactions';
import {
  dueText,
  LOAN_TYPES,
  personSummary,
  reminderMessage,
  repaymentFor,
  runningRemaining,
  shortLeft,
  timelineText,
} from '../../domain/loans';
import { useDeleteTransaction } from '../../hooks/useDeleteTransaction';
import { useFocusQuery } from '../../hooks/useFocusQuery';
import { showMessage } from '../../ui/notify';
import { formatShortDate } from '../../utils/dates';
import { formatINR } from '../../utils/money';

const sameName = (a, b) => a.trim().toLowerCase().replace(/\s+/g, ' ') === b.trim().toLowerCase().replace(/\s+/g, ' ');

/** "Rahul Sharma" -> "RS" */
function initials(name) {
  return name
    .trim()
    .split(/\s+/)
    .map((word) => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// Small outline icons, same style as the rest of the app.
const STROKE = { fill: 'none', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
const ICONS = {
  first: (c) => (
    <>
      <Rect x={4} y={5} width={16} height={15} rx={2} stroke={c} {...STROKE} />
      <Path d="M4 10h16M8 3v4M16 3v4" stroke={c} {...STROKE} />
    </>
  ),
  back: (c) => <Path d="M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" stroke={c} {...STROKE} />,
  count: (c) => <Path d="M9 4L7 20M17 4l-2 16M4 9h16M3 15h16" stroke={c} {...STROKE} />,
  clock: (c) => <Path d="M12 7v5l3 2M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9z" stroke={c} {...STROKE} />,
  tick: (c) => <Path d="M5 12.5l4.5 4.5L19 7.5" stroke={c} {...STROKE} strokeWidth={2.6} />,
  pencil: (c) => <Path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" stroke={c} {...STROKE} />,
};
function Icon({ name, size = 14, color = colors.textMuted }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      {ICONS[name](color)}
    </Svg>
  );
}

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

const RING_SIZE = 80;
const RING_STROKE = 8;

/**
 * The Summary card: "₹2,000 of ₹59,000 back" on top, a ring with the % that
 * came back, and three short lines (since when, last money back, entries).
 */
function SummaryCard({ summary }) {
  const r = (RING_SIZE - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * r;
  const percent = `${Math.round(summary.share * 100)}%`;
  const facts = [
    summary.firstAt ? { icon: 'first', text: `Since ${formatShortDate(summary.firstAt)}` } : null,
    {
      icon: 'back',
      text: summary.lastBackAt ? `Last back ${formatShortDate(summary.lastBackAt)}` : 'Nothing back yet',
    },
    { icon: 'count', text: `${summary.count} ${summary.count === 1 ? 'entry' : 'entries'}` },
  ].filter(Boolean);
  return (
    <Card title="Summary">
      <Text style={styles.summaryLine}>{`${formatINR(summary.back)} of ${formatINR(summary.total)} back`}</Text>
      <View style={styles.ringRow}>
        <View style={styles.ring} accessible accessibilityLabel={`${percent} back`}>
          <Svg width={RING_SIZE} height={RING_SIZE} accessible={false}>
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={r}
              stroke={colors.background}
              strokeWidth={RING_STROKE}
              fill="none"
            />
            {summary.share > 0 ? (
              <Circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={r}
                stroke={colors.income}
                strokeWidth={RING_STROKE}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${circumference * summary.share} ${circumference}`}
                rotation={-90}
                origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
              />
            ) : null}
          </Svg>
          <View style={styles.ringCenter}>
            <Text style={styles.ringPercent}>{percent}</Text>
            <Text style={styles.ringCaption}>back</Text>
          </View>
        </View>
        <View style={styles.facts}>
          {facts.map((fact) => (
            <View key={fact.icon} style={styles.fact}>
              <View style={styles.factIcon}>
                <Icon name={fact.icon} />
              </View>
              <Text style={styles.factText}>{fact.text}</Text>
            </View>
          ))}
        </View>
      </View>
    </Card>
  );
}

/** One statement line: date, what happened (purpose, what was left), amount. Tap to edit. */
function StatementRow({ entry, left, onEdit, onDelete }) {
  const type = LOAN_TYPES[entry.loanType];
  return (
    <SwipeableRow
      leftAction={{ label: 'Edit', color: colors.primary, onPress: onEdit }}
      rightAction={{ label: 'Delete', color: colors.danger, onPress: onDelete }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${formatShortDate(entry.occurredAt)}, ${type.label}, ${left}`}
        accessibilityHint="Opens the entry to edit. Long press to delete."
        onPress={onEdit}
        onLongPress={onDelete}
        style={({ pressed }) => [styles.tableRow, pressed && styles.pressed]}
      >
        <Text style={[styles.td, styles.colDate]}>{formatShortDate(entry.occurredAt)}</Text>
        <View style={styles.flex}>
          <Text style={styles.td}>{type.label}</Text>
          {entry.purpose ? <Text style={styles.muted}>{entry.purpose}</Text> : null}
          <Text style={styles.left} numberOfLines={1}>
            {`→ ${left}`}
          </Text>
        </View>
        <View style={styles.colAmount}>
          <Amount paise={entry.amountPaise} direction={entry.direction} showSign size="sm" />
        </View>
      </Pressable>
    </SwipeableRow>
  );
}

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
  const repayment = repaymentFor(balance.status);
  const remainingAfter = runningRemaining(entries);
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
              <Icon name={settled ? 'tick' : 'clock'} size={12} color={statusColor} />
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
            <Icon name="pencil" size={16} />
          </Pressable>
        </View>

        <View style={styles.hero} accessible accessibilityLabel={timeline?.spoken}>
          {settled ? (
            <Text style={styles.heroSettled}>Fully settled</Text>
          ) : (
            <>
              <Amount
                paise={balance.amountPaise}
                direction={balance.status === 'owesYou' ? 'credit' : 'debit'}
                size="xxl"
              />
              <Text style={styles.muted}>{balance.status === 'owesYou' ? 'left to receive' : 'left to return'}</Text>
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
        {repayment ? (
          <RoundAction label="Record" symbol="+" primary onPress={() => addEntry(repayment, balance.amountPaise)} />
        ) : null}
        {balance.status === 'owesYou' ? <RoundAction label="Remind" symbol="✉" onPress={sendReminder} /> : null}
        <RoundAction label="Gave more" symbol="↗" onPress={() => addEntry('lent')} />
        <RoundAction label="Took more" symbol="↙" onPress={() => addEntry('borrowed')} />
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

      <SummaryCard summary={summary} />

      <Card title="Statement">
        <View style={[styles.tableRow, styles.tableHead]}>
          <Text style={[styles.th, styles.colDate]}>Date</Text>
          <Text style={[styles.th, styles.flex]}>Detail</Text>
          <Text style={[styles.th, styles.colAmount, styles.thRight]}>Amount</Text>
        </View>
        {statement.map((entry) => (
          <StatementRow
            key={entry.id}
            entry={entry}
            left={shortLeft(remainingAfter[entry.id])}
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
  // Summary.
  summaryLine: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  ringRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginTop: spacing.md },
  ring: { width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' },
  ringCenter: { position: 'absolute', alignItems: 'center' },
  ringPercent: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  ringCaption: { fontSize: fontSize.xs, color: colors.textMuted },
  facts: { flex: 1, gap: spacing.sm },
  fact: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  factIcon: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  factText: { fontSize: fontSize.sm, color: colors.text },
  // Statement table.
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  tableHead: { paddingTop: 0 },
  th: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textMuted },
  thRight: { textAlign: 'right' },
  td: { fontSize: fontSize.sm, color: colors.text },
  left: { fontSize: fontSize.xs, color: colors.people },
  colDate: { width: 56 },
  colAmount: { width: 100, alignItems: 'flex-end' },
});
