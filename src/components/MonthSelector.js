import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { formatMonthLabel, isCurrentOrFutureMonth, parseMonthKey, shiftMonth } from '../utils/dates';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** A thin chevron pointing left or right, drawn with react-native-svg. */
function Chevron({ direction }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" accessible={false}>
      <Path
        d={direction === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}
        stroke={colors.text}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

/** A round arrow button; greyed out and not tappable when disabled. */
function RoundArrow({ direction, label, disabled = false, onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.arrow, disabled && styles.disabled, pressed && styles.pressed]}
    >
      <Chevron direction={direction} />
    </Pressable>
  );
}

/**
 * Month picker shown as a small calendar tile:
 *   ┌─────┐
 *   │ NOV │  November              (‹) (›)
 *   │2026 │
 *   └─────┘
 * The arrows move one month; you cannot go past the current month.
 */
export function MonthSelector({ monthKey, onChange }) {
  const { year, month } = parseMonthKey(monthKey);
  const atCurrentMonth = isCurrentOrFutureMonth(monthKey);

  return (
    <View style={styles.row}>
      <View style={styles.badge} accessible accessibilityLabel={formatMonthLabel(monthKey)}>
        <View style={styles.badgeTop}>
          <Text style={styles.badgeMonth}>{MONTH_NAMES[month - 1].slice(0, 3).toUpperCase()}</Text>
        </View>
        <Text style={styles.badgeYear}>{year}</Text>
      </View>
      <Text style={styles.label} accessibilityLiveRegion="polite" numberOfLines={1}>
        {MONTH_NAMES[month - 1]}
      </Text>
      <View style={styles.arrows}>
        <RoundArrow direction="left" label="Previous month" onPress={() => onChange(shiftMonth(monthKey, -1))} />
        <RoundArrow
          direction="right"
          label="Next month"
          disabled={atCurrentMonth}
          onPress={() => onChange(shiftMonth(monthKey, 1))}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  // The calendar tile: a teal strip with the month, the year below.
  badge: {
    width: 48,
    borderRadius: radius.sm,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
  },
  badgeTop: { alignSelf: 'stretch', backgroundColor: colors.primary, alignItems: 'center', paddingVertical: 2 },
  badgeMonth: { fontSize: fontSize.xs, fontWeight: '700', color: colors.onPrimary, letterSpacing: 0.5 },
  badgeYear: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text, paddingVertical: spacing.xs },
  label: { flex: 1, fontSize: fontSize.lg, fontWeight: '600', color: colors.text },
  arrows: { flexDirection: 'row', gap: spacing.sm },
  arrow: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  disabled: { opacity: 0.3 },
  pressed: { opacity: 0.6 },
});
