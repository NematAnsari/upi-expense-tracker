import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { formatMonthLabel, getMonthKey, isCurrentOrFutureMonth, parseMonthKey, shiftMonth } from '../utils/dates';

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

const monthKeyOf = (year, month) => `${year}-${String(month).padStart(2, '0')}`;

/**
 * The month grid that opens when you tap the month: the year with arrows on
 * top, then 12 months to tap. Months after this one cannot be picked.
 */
function MonthGrid({ visible, monthKey, onPick, onClose }) {
  const selected = parseMonthKey(monthKey);
  const current = parseMonthKey(getMonthKey());
  const [year, setYear] = useState(selected.year);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close">
        {/* Taps inside the card should not close it. */}
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.yearRow}>
            <RoundArrow direction="left" label="Previous year" onPress={() => setYear(year - 1)} />
            <Text style={styles.year}>{year}</Text>
            <RoundArrow
              direction="right"
              label="Next year"
              disabled={year >= current.year}
              onPress={() => setYear(year + 1)}
            />
          </View>
          <View style={styles.grid}>
            {MONTH_NAMES.map((name, index) => {
              const month = index + 1;
              const future = year > current.year || (year === current.year && month > current.month);
              const isSelected = year === selected.year && month === selected.month;
              return (
                <Pressable
                  key={name}
                  accessibilityRole="button"
                  accessibilityLabel={`${name} ${year}`}
                  accessibilityState={{ disabled: future, selected: isSelected }}
                  disabled={future}
                  onPress={() => onPick(monthKeyOf(year, month))}
                  style={({ pressed }) => [
                    styles.cell,
                    isSelected && styles.cellSelected,
                    future && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.cellText, isSelected && styles.cellTextSelected]}>{name.slice(0, 3)}</Text>
                </Pressable>
              );
            })}
          </View>
          {monthKey === getMonthKey() ? null : (
            <Pressable accessibilityRole="button" onPress={() => onPick(getMonthKey())} style={styles.thisMonth}>
              <Text style={styles.thisMonthText}>Go to this month</Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * Month picker shown as a small calendar tile:
 *   ┌─────┐
 *   │ NOV │  November              (‹) (›)
 *   │2026 │
 *   └─────┘
 * The arrows move one month; tap the month to jump to any month (a grid).
 * You cannot go past the current month.
 */
export function MonthSelector({ monthKey, onChange }) {
  const { year, month } = parseMonthKey(monthKey);
  const atCurrentMonth = isCurrentOrFutureMonth(monthKey);
  const [gridOpen, setGridOpen] = useState(false);

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${formatMonthLabel(monthKey)}. Choose a month`}
        onPress={() => setGridOpen(true)}
        style={({ pressed }) => [styles.pick, pressed && styles.pressed]}
      >
        <View style={styles.badge}>
          <View style={styles.badgeTop}>
            <Text style={styles.badgeMonth}>{MONTH_NAMES[month - 1].slice(0, 3).toUpperCase()}</Text>
          </View>
          <Text style={styles.badgeYear}>{year}</Text>
        </View>
        <Text style={styles.label} accessibilityLiveRegion="polite" numberOfLines={1}>
          {MONTH_NAMES[month - 1]} ▾
        </Text>
      </Pressable>
      {/* Keyed by month so the grid opens on the year being shown. */}
      <MonthGrid
        key={monthKey}
        visible={gridOpen}
        monthKey={monthKey}
        onClose={() => setGridOpen(false)}
        onPick={(picked) => {
          setGridOpen(false);
          onChange(picked);
        }}
      />
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
  pick: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  label: { flex: 1, fontSize: fontSize.lg, fontWeight: '600', color: colors.text },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: spacing.lg },
  sheet: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, gap: spacing.md },
  yearRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  year: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.sm },
  cell: { width: '25%', alignItems: 'center', paddingVertical: spacing.md, borderRadius: radius.pill },
  cellSelected: { backgroundColor: colors.primary },
  cellText: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  cellTextSelected: { color: colors.onPrimary },
  thisMonth: { alignItems: 'center', paddingVertical: spacing.sm },
  thisMonthText: { fontSize: fontSize.md, fontWeight: '600', color: colors.primary },
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
