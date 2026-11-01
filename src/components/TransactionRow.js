import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, spacing } from '../constants/theme';
import { activityTitle } from '../domain/loans';
import { formatDateTime, formatShortDate, formatTime } from '../utils/dates';
import { formatINR } from '../utils/money';
import { Amount } from './Amount';
import { CategoryIcon } from './CategoryIcon';

/**
 * The simple row for expenses and income (Expenses tab, History):
 *   (cart↗) City Mart                -₹500.00
 *           Groceries          1 Nov, 3:05 PM
 *           Weekly shopping
 * A category icon with a small red ↗ (paid) or green ↙ (received) badge, then
 * name, category and purpose. Without a name the purpose is the title, so the
 * last line shows how it was paid ("Cash", "UPI · BOI ••2222").
 */
function SimpleRow({ transaction, onPress, onLongPress }) {
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
          <Text style={styles.simpleTitle} numberOfLines={1}>
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
          <Text style={styles.simpleSubtitle} numberOfLines={1}>
            {last}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/**
 * One transaction in a list.
 * variant="simple": the category-icon row above (expenses and income lists).
 * Default (the person page):
 *   Paid to XYZ Store / Gave money to Amit     amount (red paid, green received)
 *   Purpose (what for), if any
 *   Category · account · date and time  (money given and taken: no category)
 *   note, if given (the person page uses it for "→ ₹57,000.00 left to receive")
 */
export function TransactionRow({ transaction, onPress, onLongPress, note, variant }) {
  if (variant === 'simple') {
    return <SimpleRow transaction={transaction} onPress={onPress} onLongPress={onLongPress} />;
  }
  const { amountPaise, direction, purpose, merchant, categoryName, occurredAt, paymentMethod, accountName, loanType } =
    transaction;
  const title = activityTitle(transaction);
  const subtitle = merchant && purpose ? purpose : null;
  // Money given and taken is filed under an internal category; the title already says what it is.
  const details = [loanType ? null : categoryName, accountName || paymentMethod, formatDateTime(occurredAt)]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}${subtitle ? `, ${subtitle}` : ''}, ${formatINR(amountPaise)} ${direction === 'credit' ? 'in' : 'out'}, ${formatDateTime(occurredAt)}`}
      accessibilityHint={onLongPress ? 'Opens the transaction to edit. Long press to delete.' : 'Opens the transaction'}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.main}>
        <Text style={[styles.title, loanType && styles.peopleTitle]} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        <Text style={styles.details} numberOfLines={1}>
          {details}
        </Text>
        {note ? (
          <Text style={styles.note} numberOfLines={1}>
            {note}
          </Text>
        ) : null}
      </View>
      <Amount paise={amountPaise} direction={direction} showSign />
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
  title: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  // Money given and taken: the quiet accent on the words only; the amount keeps red/green.
  peopleTitle: { color: colors.people },
  subtitle: { fontSize: fontSize.md, color: colors.text },
  details: { fontSize: fontSize.sm, color: colors.textMuted },
  note: { fontSize: fontSize.sm, fontWeight: '600', color: colors.people },
  // Simple row: line 1 and 2 are left / right pairs so the right side lines up.
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  simpleTitle: { flex: 1, fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  category: { flex: 1, fontSize: fontSize.xs, fontWeight: '500', color: colors.textMuted },
  meta: { fontSize: fontSize.xs, color: colors.textMuted },
  simpleSubtitle: { fontSize: fontSize.sm, color: colors.textMuted },
});
