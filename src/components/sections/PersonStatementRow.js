// The statement table on a person's screen: a header row, then one row per
// entry with what was left after it. Swipe right to edit, left to delete.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Amount } from '../basics/Amount';
import { editDeleteActions, SwipeableRow } from '../basics/SwipeableRow';
import { colors, fontSize, spacing } from '../../constants/theme';
import { LOAN_TYPES } from '../../domain/entryTypes';
import { formatShortDate } from '../../utils/dates';

export function PersonStatementHeader() {
  return (
    <View style={[styles.tableRow, styles.tableHead]}>
      <Text style={[styles.th, styles.colDate]}>Date</Text>
      <Text style={[styles.th, styles.flex]}>Detail</Text>
      <Text style={[styles.th, styles.colAmount, styles.thRight]}>Amount</Text>
    </View>
  );
}

/** One line: date, what happened (purpose, what was left), amount. */
export function PersonStatementRow({ entry, remainingText, onEdit, onDelete }) {
  const type = LOAN_TYPES[entry.loanType];
  return (
    <SwipeableRow {...editDeleteActions(onEdit, onDelete)}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${formatShortDate(entry.occurredAt)}, ${type.label}, ${remainingText}`}
        accessibilityHint="Opens the entry to edit. Long press to delete."
        onPress={onEdit}
        onLongPress={onDelete}
        style={({ pressed }) => [styles.tableRow, pressed && styles.pressed]}
      >
        <Text style={[styles.td, styles.colDate]}>{formatShortDate(entry.occurredAt)}</Text>
        <View style={styles.flex}>
          <Text style={styles.td}>{type.label}</Text>
          {entry.purpose ? <Text style={styles.muted}>{entry.purpose}</Text> : null}
          <Text style={styles.remainingText} numberOfLines={1}>
            {`→ ${remainingText}`}
          </Text>
        </View>
        <View style={styles.colAmount}>
          <Amount paise={entry.amountPaise} direction={entry.direction} showSign size="sm" />
        </View>
      </Pressable>
    </SwipeableRow>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.6 },
  muted: { fontSize: fontSize.sm, color: colors.textMuted },
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
  remainingText: { fontSize: fontSize.xs, color: colors.people },
  colDate: { width: 56 },
  colAmount: { width: 100, alignItems: 'flex-end' },
});
