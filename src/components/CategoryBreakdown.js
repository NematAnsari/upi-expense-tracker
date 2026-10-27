import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { formatINR, formatPercent } from '../utils/money';
import { Amount } from './Amount';

/**
 * Spending per category: name, amount, share of the total and a simple bar.
 * Only expenses are listed here, so amounts and bars use the expense colour.
 */
export function CategoryBreakdown({ categories }) {
  return (
    <View style={styles.list}>
      {categories.map((category) => (
        <View
          key={category.categoryId}
          style={styles.item}
          accessible
          accessibilityLabel={`${category.categoryName}: ${formatINR(category.totalPaise)}, ${formatPercent(category.percent)} of spending`}
        >
          <View style={styles.labels}>
            <Text style={styles.name} numberOfLines={1}>
              {category.categoryName}
            </Text>
            <Amount paise={category.totalPaise} />
          </View>
          <View style={styles.barRow}>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.max(category.percent, 1)}%` }]} />
            </View>
            <Text style={styles.percent}>{formatPercent(category.percent)}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  item: { gap: spacing.xs },
  labels: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  name: { flex: 1, fontSize: fontSize.md, color: colors.text },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  track: {
    flex: 1,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.expenseSoft,
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: colors.expense, borderRadius: radius.pill },
  percent: { width: 52, textAlign: 'right', fontSize: fontSize.sm, color: colors.textMuted },
});
