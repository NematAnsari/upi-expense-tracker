// Reports tab. Month: one month at a glance. Day by day: a calendar of what was
// spent, received, given or taken each day (see DayCalendar).
//   Month card: "Spent in November", the total and the change from last month
//   on top; a ring of spending by category below, with each slice's name and %
//   in two columns under it; then the money received.
//   Where it went: every category with its color dot, amount and %; tap one
//   to see its entries in History.
//   Given & Taken: the two remaining totals as full-width lines (all time,
//   never part of spending).
// Amounts: red paid, green received.

import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Amount } from '../../components/basics/Amount';
import { Card } from '../../components/basics/Card';
import { SegmentedControl } from '../../components/basics/SegmentedControl';
import { DAY_KIND_OPTIONS, DayCalendar, DayKindTotal } from '../../components/sections/DayCalendar';
import { CategoryRing, ringSlices, shortPercent } from '../../components/sections/CategoryRing';
import { MonthSelector } from '../../components/sections/MonthSelector';
import { EmptyState, ErrorState, LoadingState } from '../../components/basics/ScreenStates';
import { TextLink } from '../../components/basics/TextLink';
import { chartOtherColor, colors, fontSize, spacing } from '../../constants/theme';
import { getDailyTotals, getMonthlyReport } from '../../db/reports';
import { BALANCE_TEXT } from '../../domain/people';
import { useFocusQuery } from '../../hooks/useFocusQuery';
import { formatMonthLabel, getMonthKey, MONTH_NAMES, parseMonthKey } from '../../utils/dates';
import { formatINR, percentOf } from '../../utils/money';
import { plural } from '../../utils/text';
import { getPeopleBalances } from '../../db/people';

/** "November" */
function monthName(monthKey) {
  return MONTH_NAMES[parseMonthKey(monthKey).month - 1];
}

/** A small round color dot: the category's slice color in the ring. */
function Dot({ color }) {
  return <View style={[styles.dot, { backgroundColor: color }]} />;
}

/** "▲ ₹500.00 more than October" (red), "▼ ... less" (green) or a plain note. */
function Comparison({ comparison }) {
  const { previousMonthKey, previousTotalPaise, changePaise } = comparison;
  const month = monthName(previousMonthKey);
  if (previousTotalPaise === 0) {
    return <Text style={styles.muted}>Nothing spent in {month} to compare</Text>;
  }
  if (changePaise === 0) {
    return <Text style={styles.muted}>Same as {month}</Text>;
  }
  const more = changePaise > 0;
  return (
    <Text style={styles.muted}>
      <Text style={[styles.change, { color: more ? colors.expense : colors.income }]}>
        {`${more ? '▲' : '▼'} ${formatINR(Math.abs(changePaise))} ${more ? 'more' : 'less'}`}
      </Text>
      {` than ${month}`}
    </Text>
  );
}

/** "Money to receive          ₹57,000.00", or the zero text in grey. */
function BalanceLine({ label, paise, direction, zeroText }) {
  return (
    <View style={styles.balanceLine}>
      <Text style={styles.balanceLabel}>{label}</Text>
      {paise > 0 ? (
        <Amount paise={paise} direction={direction} size="lg" />
      ) : (
        <Text style={styles.muted}>{zeroText}</Text>
      )}
    </View>
  );
}

/**
 * One line in "Where it went":
 *   ●  Food & Dining            ₹4,200.00
 *      6 expenses                     34%
 * onPress(categoryId) opens its entries.
 */
function CategoryLine({ category, color, percent, onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${category.categoryName}: ${formatINR(category.totalPaise)}, ${shortPercent(percent)}. Show entries`}
      onPress={() => onPress(category.categoryId)}
      style={({ pressed }) => [styles.line, pressed && styles.pressed]}
    >
      <Dot color={color} />
      <View style={styles.lineText}>
        <Text style={styles.lineName} numberOfLines={1}>
          {category.categoryName}
        </Text>
        <Text style={styles.muted}>{plural(category.count, 'expense', 'expenses')}</Text>
      </View>
      <View style={styles.lineRight}>
        <Amount paise={category.totalPaise} direction="debit" />
        <Text style={styles.muted}>{shortPercent(percent)}</Text>
      </View>
    </Pressable>
  );
}

const VIEWS = [
  { value: 'month', label: 'Month' },
  { value: 'days', label: 'Day by day' },
];

export default function ReportsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [monthKey, setMonthKey] = useState(getMonthKey);
  const [view, setView] = useState('month');
  const [dayKind, setDayKind] = useState('spent');
  // The tapped day in the calendar (its start time), or null.
  const [pickedDay, setPickedDay] = useState(null);

  const loader = useCallback(async () => {
    const [monthly, balances, days] = await Promise.all([
      getMonthlyReport(db, monthKey),
      getPeopleBalances(db),
      getDailyTotals(db, monthKey),
    ]);
    return { ...monthly, balances, days };
  }, [db, monthKey]);
  const { data: report, error, reload } = useFocusQuery(loader);

  // Runs only on tap. `at` makes each tap a new navigation, so History re-applies the filter.
  function openCategory(categoryId) {
    router.navigate({
      pathname: '/history',
      params: { filter: 'category', categoryId, month: monthKey, at: Date.now() },
    });
  }

  function changeMonth(nextMonthKey) {
    setMonthKey(nextMonthKey);
    setPickedDay(null);
  }

  function renderDays() {
    return (
      <>
        <SegmentedControl options={DAY_KIND_OPTIONS} value={dayKind} onChange={setDayKind} small />
        <DayKindTotal days={report.days} kind={dayKind} />
        <DayCalendar days={report.days} kind={dayKind} selected={pickedDay} onSelect={setPickedDay} />
      </>
    );
  }

  function renderMonth() {
    const slices = ringSlices(report.categories);
    // The list uses the same colors as the ring; categories folded into
    // "Other categories" get its grey.
    const colorOf = (categoryId) => slices.find((slice) => slice.categoryId === categoryId)?.color ?? chartOtherColor;
    return (
      <>
        <Card>
          <View style={styles.headline}>
            <Text style={styles.muted}>{`Spent in ${monthName(monthKey)}`}</Text>
            <Amount paise={report.totalPaise} direction="debit" size="xxl" />
            <Comparison comparison={report.comparison} />
          </View>
          <View style={styles.ring}>
            <CategoryRing slices={slices} totalPaise={report.totalPaise} />
          </View>
          {/* Two columns, so every name has room. */}
          <View style={styles.legend}>
            {slices.map((slice) => (
              <View key={slice.key} style={styles.legendItem}>
                <Dot color={slice.color} />
                <Text style={styles.legendName} numberOfLines={1}>
                  {slice.name}
                </Text>
                <Text style={styles.legendPercent}>{shortPercent(slice.percent)}</Text>
              </View>
            ))}
          </View>
          <View style={styles.footer}>
            <Text style={styles.muted}>
              {'Received '}
              <Amount paise={report.receivedPaise} direction="credit" size="sm" />
              {` · ${plural(report.count, 'expense', 'expenses')}`}
            </Text>
          </View>
        </Card>

        <View style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            Where it went
          </Text>
          <Card>
            {report.categories.map((category, index) => (
              <View key={category.categoryId} style={index > 0 && styles.divider}>
                <CategoryLine
                  category={category}
                  color={colorOf(category.categoryId)}
                  percent={percentOf(category.totalPaise, report.totalPaise)}
                  onPress={openCategory}
                />
              </View>
            ))}
          </Card>
          <Text style={styles.hint}>Tip: tap a category to see its entries.</Text>
        </View>
      </>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <SegmentedControl options={VIEWS} value={view} onChange={setView} />
      <MonthSelector monthKey={monthKey} onChange={changeMonth} />

      {error ? <ErrorState onRetry={reload} /> : null}
      {!report && !error ? <LoadingState /> : null}

      {report && view === 'days' ? renderDays() : null}

      {report && view === 'month' ? (
        <>
          {report.count === 0 ? (
            <EmptyState
              title="No expenses this month"
              message={`Spending for ${formatMonthLabel(report.monthKey)} shows here once you add an expense.`}
            />
          ) : (
            renderMonth()
          )}

          {/* Kept apart from the spending above: these are not spending or income. */}
          {report.balances.people.length > 0 ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle} accessibilityRole="header">
                  Given & Taken
                </Text>
                <TextLink label="View all ›" onPress={() => router.navigate('/given-taken')} />
              </View>
              {/* Full-width lines, so large amounts always fit next to their label. */}
              <Card>
                <BalanceLine
                  label={BALANCE_TEXT.toReceive}
                  paise={report.balances.toReceivePaise}
                  direction="credit"
                  zeroText="Nothing to receive"
                />
                <View style={styles.divider}>
                  <BalanceLine
                    label={BALANCE_TEXT.toReturn}
                    paise={report.balances.toReturnPaise}
                    direction="debit"
                    zeroText="Nothing to return"
                  />
                </View>
              </Card>
              <Text style={styles.muted}>All time. Not part of spending or income.</Text>
            </View>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl },
  pressed: { opacity: 0.6 },
  muted: { fontSize: fontSize.sm, color: colors.textMuted },
  dot: { width: 10, height: 10, borderRadius: 5 },
  // Month card.
  headline: { gap: spacing.xs },
  ring: { alignItems: 'center', marginVertical: spacing.lg },
  legend: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.sm },
  // Half the card each, with a little space before the next column.
  legendItem: { width: '50%', flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingRight: spacing.md },
  legendName: { flexShrink: 1, fontSize: fontSize.sm, color: colors.text },
  legendPercent: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  footer: {
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  change: { fontWeight: '700' },
  // Where it went.
  section: { gap: spacing.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  lineText: { flex: 1, gap: 2 },
  lineName: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  lineRight: { alignItems: 'flex-end', gap: 2 },
  hint: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' },
  balanceLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  balanceLabel: { flexShrink: 1, fontSize: fontSize.md, color: colors.text },
});
