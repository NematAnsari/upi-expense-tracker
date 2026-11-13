import { memo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, spacing } from '../../constants/theme';
import { paymentText } from '../../domain/entryTypes';
import { formatShortDate, formatTime } from '../../utils/dates';
import { formatINR } from '../../utils/money';
import { Amount } from '../basics/Amount';
import { CountPill } from '../basics/CountPill';
import { editDeleteActions, SwipeableRow } from '../basics/SwipeableRow';
import { CategoryIcon } from '../icons/CategoryIcon';
import { TransactionRow } from './TransactionRow';

/**
 * One entry on its own. Swipe right to edit, left to delete; tap to edit and
 * long-press to delete also work (screen readers use those). onDelete should confirm.
 */
function SingleRow({ transaction, onEdit, onDelete, background }) {
  return (
    <SwipeableRow
      background={background}
      {...editDeleteActions(
        () => onEdit(transaction),
        () => onDelete(transaction),
      )}
    >
      <TransactionRow
        transaction={transaction}
        onPress={() => onEdit(transaction)}
        onLongPress={() => onDelete(transaction)}
      />
    </SwipeableRow>
  );
}

/** One purchase inside an open group: time, how it was paid, amount. Swipes like any row. */
function GroupItemRow({ transaction, onEdit, onDelete, background }) {
  const payment = paymentText(transaction);
  return (
    <SwipeableRow
      background={background}
      {...editDeleteActions(
        () => onEdit(transaction),
        () => onDelete(transaction),
      )}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${formatTime(transaction.occurredAt)}, ${payment}, ${formatINR(transaction.amountPaise)}`}
        accessibilityHint="Opens the transaction to edit. Long press to delete."
        onPress={() => onEdit(transaction)}
        onLongPress={() => onDelete(transaction)}
        style={({ pressed }) => [styles.groupItem, pressed && styles.pressed]}
      >
        <Text style={styles.time}>{formatTime(transaction.occurredAt)}</Text>
        <Text style={styles.payment} numberOfLines={1}>
          {payment}
        </Text>
        <Amount paise={transaction.amountPaise} direction={transaction.direction} showSign size="sm" />
      </Pressable>
    </SwipeableRow>
  );
}

// Groups are rebuilt on every render, but their entries keep their identity,
// so comparing the entries tells whether the row really changed.
function sameRow(before, after) {
  return (
    before.onEdit === after.onEdit &&
    before.onDelete === after.onDelete &&
    before.background === after.background &&
    before.group.items.length === after.group.items.length &&
    before.group.items.every((item, index) => item === after.group.items[index])
  );
}

/**
 * A row in the Expenses and History lists. group: from groupRepeats.
 * One entry is a normal swipeable row; repeat purchases are one row with a
 * count and the day's total, which opens to show each purchase:
 *   (icon) Chocolate (3)          −₹90.00
 *          Food & Dining
 *          4 Nov · 9:10 AM – 6:40 PM     ▾
 *      │ 9:10 AM   UPI          −₹30.00
 * onEdit(transaction), onDelete(transaction): onDelete should confirm.
 */
export const TransactionListItem = memo(function TransactionListItem({
  group,
  onEdit,
  onDelete,
  background = colors.surface,
}) {
  const [open, setOpen] = useState(false);
  if (group.items.length === 1) {
    return <SingleRow transaction={group.items[0]} onEdit={onEdit} onDelete={onDelete} background={background} />;
  }

  const first = group.items[0];
  const title = first.merchant || first.purpose;
  const count = group.items.length;
  const when = `${formatShortDate(group.firstAt)} · ${formatTime(group.firstAt)} – ${formatTime(group.lastAt)}`;
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${count} times, ${first.categoryName}, total ${formatINR(group.totalPaise)}, ${when}`}
        accessibilityState={{ expanded: open }}
        accessibilityHint={open ? 'Hides the purchases' : 'Shows each purchase'}
        onPress={() => setOpen(!open)}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <CategoryIcon categoryName={first.categoryName} direction={group.direction} />
        <View style={styles.main}>
          <View style={styles.line}>
            <View style={styles.titleWrap}>
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
              <CountPill count={count} />
            </View>
            <Amount paise={group.totalPaise} direction={group.direction} showSign />
          </View>
          <Text style={styles.category} numberOfLines={1}>
            {first.categoryName}
          </Text>
          <View style={styles.line}>
            <Text style={styles.meta}>{when}</Text>
            <Text style={styles.chevron}>{open ? '▴' : '▾'}</Text>
          </View>
        </View>
      </Pressable>
      {open ? (
        <View style={styles.groupItems}>
          {group.items.map((transaction) => (
            <GroupItemRow
              key={transaction.id}
              transaction={transaction}
              onEdit={onEdit}
              onDelete={onDelete}
              background={background}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}, sameRow);

const styles = StyleSheet.create({
  pressed: { opacity: 0.6 },
  // Same layout as TransactionRow, so groups and single rows line up.
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, gap: spacing.md },
  main: { flex: 1, gap: 2 },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  titleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  title: { flexShrink: 1, fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  category: { fontSize: fontSize.xs, fontWeight: '500', color: colors.textMuted },
  meta: { flex: 1, fontSize: fontSize.xs, color: colors.textMuted },
  chevron: { fontSize: fontSize.sm, color: colors.textMuted },
  // Indented under the icon, with a thin line on the left to show they belong together.
  groupItems: {
    marginLeft: 19,
    paddingLeft: spacing.lg + 7,
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
    marginBottom: spacing.sm,
  },
  groupItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  time: { width: 72, fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  payment: { flex: 1, fontSize: fontSize.sm, color: colors.textMuted },
});
