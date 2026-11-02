import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, spacing } from '../constants/theme';
import { formatDateTime, formatShortDate, formatTime } from '../utils/dates';
import { formatINR } from '../utils/money';
import { Amount } from './Amount';
import { CategoryIcon } from './CategoryIcon';

/**
 * One expense or income in a list (Expenses tab, History):
 *   (cart↗) City Mart                -₹500.00
 *           Groceries          1 Nov, 3:05 PM
 *           Weekly shopping
 * A category icon with a small red ↗ (paid) or green ↙ (received) badge, then
 * name, category and purpose. Without a name the purpose is the title, so the
 * last line shows how it was paid ("Cash", "UPI · BOI ••2222").
 */
export function TransactionRow({ transaction, onPress, onLongPress }) {
  const { amountPaise, direction, purpose, merchant, categoryName, occurredAt, paymentMethod, accountName } =
    transaction;
  const title = merchant || purpose || categoryName;
  const payment = [paymentMethod, accountName].filter(Boolean).join(' · ');
  const last = merchant && purpose ? purpose : payment;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${categoryName}${merchant && purpose ? `, ${purpose}` : ''}, ${direction === 'credit' ? 'received' : 'paid'} ${formatINR(amountPaise)}, ${formatDateTime(occurredAt)}`}
      accessibilityHint={onLongPress ? 'Opens the transaction to edit. Long press to delete.' : 'Opens the transaction'}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <CategoryIcon categoryName={categoryName} direction={direction} />
      <View style={styles.main}>
        <View style={styles.line}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Amount paise={amountPaise} direction={direction} showSign />
        </View>
        <View style={styles.line}>
          <Text style={styles.category} numberOfLines={1}>
            {categoryName}
          </Text>
          <Text style={styles.meta}>{`${formatShortDate(occurredAt)}, ${formatTime(occurredAt)}`}</Text>
        </View>
        {last ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {last}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  pressed: { opacity: 0.6 },
  main: { flex: 1, gap: 2 },
  // Lines 1 and 2 are left / right pairs so the right side lines up.
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { flex: 1, fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  category: { flex: 1, fontSize: fontSize.xs, fontWeight: '500', color: colors.textMuted },
  meta: { fontSize: fontSize.xs, color: colors.textMuted },
  subtitle: { fontSize: fontSize.sm, color: colors.textMuted },
});
