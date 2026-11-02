// Reports tab: one month at a glance.
//   Ring card: spending by category as a ring (total in the middle) with each
//   slice's name and % beside it, then one line comparing with last month and
//   the money received.
//   Where it went: every category with its colour dot, amount and %; tap one
//   to see its entries in History.
//   Given & Taken: the two remaining totals (all time, never part of spending).
// Amounts: red paid, green received.

import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Amount } from '../../components/Amount';
import { Card } from '../../components/Card';
import { CategoryRing, ringSlices, shortPercent } from '../../components/CategoryRing';
import { MonthSelector } from '../../components/MonthSelector';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { TextLink } from '../../components/TextLink';
import { TotalTile } from '../../components/TotalTile';
import { chartOtherColor, colors, fontSize, spacing } from '../../constants/theme';
import { getLoanBalances, getMonthlyReport } from '../../db/reports';
import { BALANCE_TEXT } from '../../domain/loans';
import { useFocusQuery } from '../../hooks/useFocusQuery';
import { formatMonthLabel, getMonthKey } from '../../utils/dates';
import { formatINR, percentOf } from '../../utils/money';

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

/** A small round colour dot: the category's slice colour in the ring. */
function Dot({ color }) {
  return <View style={[styles.dot, { backgroundColor: color }]} />;
}

/** "▲ ₹500.00 more than October" (red), "▼ ... less" (green) or a plain note. */
function Comparison({ comparison }) {
  const { previousMonthKey, previousTotalPaise, changePaise } = comparison;
  const month = formatMonthLabel(previousMonthKey).split(' ')[0];
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

export default function ReportsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [monthKey, setMonthKey] = useState(getMonthKey());

  const loader = useCallback(async () => {
    const [monthly, people] = await Promise.all([getMonthlyReport(db, monthKey), getLoanBalances(db)]);
    return { ...monthly, people };
  }, [db, monthKey]);
  const { data: report, error, reload } = useFocusQuery(loader);

  // Runs only on tap. `at` makes each tap a new navigation, so History re-applies the filter.
  function openCategory(categoryId) {
    router.navigate({
      pathname: '/history',
      params: { filter: 'category', categoryId, month: monthKey, at: Date.now() },
    });
  }

  function renderMonth() {
    const slices = ringSlices(report.categories);
    // The list uses the same colours as the ring; categories folded into
    // "Other categories" get its grey.
    const colorOf = (categoryId) => slices.find((slice) => slice.categoryId === categoryId)?.color ?? chartOtherColor;
    return (
      <>
        <Card>
          <View style={styles.ringRow}>
            <CategoryRing slices={slices} totalPaise={report.totalPaise} />
            <View style={styles.legend}>
              {slices.map((slice) => (
                <View key={slice.key} style={styles.legendRow}>
                  <Dot color={slice.color} />
                  <Text style={styles.legendName} numberOfLines={1}>
                    {slice.name}
                  </Text>
                  <Text style={styles.legendPercent}>{shortPercent(slice.percent)}</Text>
                </View>
              ))}
            </View>
          </View>
          <View style={styles.footer}>
            <Comparison comparison={report.comparison} />
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
      <MonthSelector monthKey={monthKey} onChange={setMonthKey} />

      {error ? <ErrorState onRetry={reload} /> : null}
      {!report && !error ? <LoadingState /> : null}

      {report ? (
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
          {report.people.people.length > 0 ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle} accessibilityRole="header">
                  Given & Taken
                </Text>
                <TextLink label="View all ›" onPress={() => router.navigate('/given-taken')} />
              </View>
              <View style={styles.tiles}>
                <TotalTile
                  label={BALANCE_TEXT.owesYou}
                  paise={report.people.owedToYouPaise}
                  direction="credit"
                  zeroText="Nothing to receive"
                />
                <TotalTile
                  label={BALANCE_TEXT.youOwe}
                  paise={report.people.youOwePaise}
                  direction="debit"
                  zeroText="Nothing to return"
                />
              </View>
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
  // Ring card.
  ringRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  legend: { flex: 1, gap: spacing.sm },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  legendName: { flex: 1, fontSize: fontSize.sm, color: colors.text },
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
  tiles: { flexDirection: 'row', gap: spacing.md },
});
