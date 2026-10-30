import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { loanLabel } from '../domain/loans';
import { formatDateTime } from '../utils/dates';
import { formatINR } from '../utils/money';
import { Amount } from './Amount';

/**
 * One transaction in a list:
 *   Name (who)                    amount (red paid, green received)
 *   Purpose (what for), if any
 *   [Lent] Category · account · date and time
 * When there is no name, the purpose (or category) becomes the title.
 */
export function TransactionRow({ transaction, onPress, onLongPress }) {
  const { amountPaise, direction, purpose, merchant, categoryName, occurredAt, paymentMethod, accountName, loanType } =
    transaction;
  const received = direction === 'credit';
  const title = merchant || purpose || categoryName;
  const subtitle = merchant && purpose ? purpose : null;
  const loan = loanLabel(loanType);
  const details = [loan ? null : categoryName, accountName || paymentMethod, formatDateTime(occurredAt)]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}${subtitle ? `, ${subtitle}` : ''}, ${loan ?? (received ? 'received' : 'paid')} ${formatINR(amountPaise)}, ${formatDateTime(occurredAt)}`}
      accessibilityHint="Opens the transaction to edit. Long press to delete."
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.main}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        <View style={styles.detailsRow}>
          {loan ? <Text style={styles.badge}>{loan}</Text> : null}
          <Text style={styles.details} numberOfLines={1}>
            {details}
          </Text>
        </View>
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
  subtitle: { fontSize: fontSize.md, color: colors.text },
  detailsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  badge: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.primary,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  details: { flex: 1, fontSize: fontSize.sm, color: colors.textMuted },
});
