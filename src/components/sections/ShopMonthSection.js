// One month on a shop account's statement. It folds open to show the month's
// numbers (carried in, taken, paid) and its entries.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Amount } from '../basics/Amount';
import { TransactionListItem } from '../rows/TransactionListItem';
import { colors, fontSize, spacing } from '../../constants/theme';
import { groupRepeats } from '../../domain/repeats';
import { formatMonthLabel, formatShortMonth, shiftMonth } from '../../utils/dates';
import { formatINR } from '../../utils/money';
import { plural } from '../../utils/text';

/** One number in a month's summary: a small label over the amount. */
function MonthFigure({ label, paise, direction = 'debit' }) {
  return (
    <View style={styles.figure}>
      <Text style={styles.figureLabel} numberOfLines={1}>
        {label}
      </Text>
      <Amount paise={paise} direction={direction} size="sm" />
    </View>
  );
}

export function ShopMonthSection({ month, entries, open, onToggle, onEdit, onDelete }) {
  const monthLabel = formatMonthLabel(month.monthKey);
  const rows = open ? groupRepeats(entries) : [];
  return (
    <View style={styles.month}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${monthLabel}, ${formatINR(month.duePaise)} due at the end`}
        onPress={onToggle}
        style={({ pressed }) => [styles.monthHeader, pressed && styles.pressed]}
      >
        <Text style={styles.chevron}>{open ? '▾' : '▸'}</Text>
        <Text style={styles.monthName}>{monthLabel}</Text>
        <Amount paise={month.duePaise} direction="debit" size="sm" />
        <Text style={styles.dueWord}>due</Text>
      </Pressable>
      {open ? (
        <View style={styles.monthBody}>
          <View style={styles.figures}>
            {month.carriedInPaise > 0 ? (
              <MonthFigure
                label={`From ${formatShortMonth(shiftMonth(month.monthKey, -1))}`}
                paise={month.carriedInPaise}
              />
            ) : null}
            <MonthFigure label={`Taken · ${plural(month.count, 'time', 'times')}`} paise={month.purchasesPaise} />
            <MonthFigure label="Paid" paise={month.paidPaise} direction="credit" />
          </View>
          {rows.length > 0 ? (
            rows.map((group) => (
              <View key={group.key} style={styles.divider}>
                <TransactionListItem group={group} onEdit={onEdit} onDelete={onDelete} />
              </View>
            ))
          ) : (
            <Text style={styles.empty}>Nothing taken or paid this month.</Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.6 },
  month: { paddingVertical: spacing.xs },
  monthHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48 },
  chevron: { width: 14, fontSize: fontSize.sm, color: colors.textMuted },
  monthName: { flex: 1, fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  dueWord: { fontSize: fontSize.xs, color: colors.textMuted },
  // Lines up with the month name, past the chevron.
  monthBody: { paddingLeft: 14 + spacing.sm, paddingBottom: spacing.sm },
  figures: { flexDirection: 'row', gap: spacing.md, paddingBottom: spacing.sm },
  figure: { flex: 1, gap: 2 },
  figureLabel: { fontSize: fontSize.xs, color: colors.textMuted },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  empty: { fontSize: fontSize.sm, color: colors.textMuted, paddingVertical: spacing.sm },
});
