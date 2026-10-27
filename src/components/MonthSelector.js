import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { formatMonthLabel, isCurrentOrFutureMonth, shiftMonth } from '../utils/dates';

export function MonthSelector({ monthKey, onChange }) {
  const atCurrentMonth = isCurrentOrFutureMonth(monthKey);
  const label = formatMonthLabel(monthKey);

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Previous month"
        onPress={() => onChange(shiftMonth(monthKey, -1))}
        style={styles.arrow}
        hitSlop={8}
      >
        <Text style={styles.arrowText}>‹</Text>
      </Pressable>
      <Text style={styles.label} accessibilityLiveRegion="polite">
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Next month"
        accessibilityState={{ disabled: atCurrentMonth }}
        disabled={atCurrentMonth}
        onPress={() => onChange(shiftMonth(monthKey, 1))}
        style={[styles.arrow, atCurrentMonth && styles.disabled]}
        hitSlop={8}
      >
        <Text style={styles.arrowText}>›</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.xs,
  },
  arrow: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowText: { fontSize: 28, color: colors.primary, lineHeight: 32 },
  disabled: { opacity: 0.25 },
  label: { fontSize: fontSize.lg, fontWeight: '600', color: colors.text },
});
