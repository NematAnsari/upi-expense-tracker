import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, spacing } from '../constants/theme';
import { formatDateTime } from '../utils/dates';
import { formatINR } from '../utils/money';
import { Amount } from './Amount';

/** One transaction in a list: what it was, where, when, and the amount (red paid, green received). */
export function TransactionRow({ transaction, onPress, onLongPress }) {
  const { amountPaise, direction, purpose, merchant, categoryName, occurredAt, paymentMethod, accountName } =
    transaction;
  const received = direction === 'credit';
  const title = purpose || merchant || categoryName;
  const details = [categoryName, purpose && merchant ? merchant : null, accountName || paymentMethod]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${received ? 'received' : 'paid'} ${formatINR(amountPaise)}, ${formatDateTime(occurredAt)}`}
      accessibilityHint="Opens the transaction to edit. Long press to delete."
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.main}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.details} numberOfLines={1}>
          {details}
        </Text>
        <Text style={styles.date}>{formatDateTime(occurredAt)}</Text>
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
  title: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  details: { fontSize: fontSize.sm, color: colors.textMuted },
  date: { fontSize: fontSize.sm, color: colors.textMuted },
});
