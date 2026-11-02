// Reports tab, laid out like the Expenses and Given & Taken tabs: month,
// two tiles (Spent, Received), a short summary (compared with last month,
// average and highest expense), then By category | By week tabs with one
// list of rows (icon, name, amount, share bar). Tap a category to see its
// entries in History. Amounts: red paid, green received.
// Money given and taken is never part of these; it has its own tiles at the end.

import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Amount } from '../../components/Amount';
import { Card } from '../../components/Card';
import { CategoryIcon } from '../../components/CategoryIcon';
import { ICONS, OutlineIcon } from '../../components/icons';
import { MonthSelector } from '../../components/MonthSelector';
import { SegmentedControl } from '../../components/SegmentedControl';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { TextLink } from '../../components/TextLink';
import { TotalTile } from '../../components/TotalTile';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { getLoanBalances, getMonthlyReport } from '../../db/reports';
import { BALANCE_TEXT } from '../../domain/loans';
import { useFocusQuery } from '../../hooks/useFocusQuery';
import { formatMonthLabel, formatShortDate, formatTime, getMonthKey } from '../../utils/dates';
import { formatINR, formatPercent, percentOf } from '../../utils/money';

const LISTS = [
  { value: 'category', label: 'By category' },
  { value: 'week', label: 'By week' },
];

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

/** One summary line: icon, label with a small detail under it, value on the right. */
function FactLine({ draw, label, detail, value, onPress, last }) {
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={[styles.fact, !last && styles.divider]}
    >
      <View style={styles.factIcon}>
        <OutlineIcon draw={draw} />
      </View>
      <View style={styles.factText}>
        <Text style={styles.factLabel}>{label}</Text>
        {detail ? (
          <Text style={styles.factDetail} numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
      {value}
    </Wrapper>
  );
}

/** "▲ ₹500.00 more" (red) or "▼ ₹500.00 less" (green) than last month, or "Same". */
function ChangeValue({ comparison }) {
  const { previousTotalPaise, changePaise, changePercent } = comparison;
  if (previousTotalPaise === 0) {
    return <Text style={styles.factValueMuted}>No spending</Text>;
  }
  if (changePaise === 0) {
    return <Text style={styles.factValueMuted}>Same</Text>;
  }
  const spentMore = changePaise > 0;
  const color = spentMore ? colors.expense : colors.income;
  return (
    <View style={styles.factRight}>
      <Text style={[styles.change, { color }]}>{`${spentMore ? '▲' : '▼'} ${formatINR(Math.abs(changePaise))}`}</Text>
      <Text style={styles.factDetail}>
        {`${spentMore ? 'more' : 'less'} (${formatPercent(Math.abs(changePercent))})`}
      </Text>
    </View>
  );
}

/**
 * One row in the By category / By week list, like the expense rows:
 *   (icon)  Food & Dining          ₹4,200.00
 *           6 expenses                    34%
 *           ▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░
 * onPress(value) runs on tap; without it the row is not tappable.
 */
function ShareRow({ icon, name, paise, count, percent, value, onPress }) {
  const empty = paise === 0;
  const label = `${name}: ${formatINR(paise)}, ${formatPercent(percent)} of spending`;
  const content = (
    <>
      {icon}
      <View style={styles.shareText}>
        <View style={styles.shareLine}>
          <Text style={styles.shareName} numberOfLines={1}>
            {name}
          </Text>
          {empty ? <Text style={styles.shareMuted}>Nothing spent</Text> : <Amount paise={paise} direction="debit" />}
        </View>
        {empty ? null : (
          <>
            <View style={styles.shareLine}>
              <Text style={styles.shareMuted}>{plural(count, 'expense', 'expenses')}</Text>
              <Text style={styles.shareMuted}>{formatPercent(percent)}</Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.max(percent, 1)}%` }]} />
            </View>
          </>
        )}
      </View>
    </>
  );
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={label} style={styles.shareRow}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => onPress(value)}
      style={({ pressed }) => [styles.shareRow, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

/** The week rows' icon: a calendar in the same circle as the category icons. */
function WeekIcon() {
  return (
    <View style={styles.weekIcon}>
      <OutlineIcon draw={ICONS.date} size={20} />
    </View>
  );
}

export default function ReportsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [monthKey, setMonthKey] = useState(getMonthKey());
  const [list, setList] = useState('category');

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
  const openTransaction = (id) => router.push({ pathname: '/transaction/[id]', params: { id } });

  function renderSummary() {
    const { highest } = report;
    return (
      <Card>
        <FactLine
          draw={ICONS.compare}
          label="Compared with last month"
          detail={formatMonthLabel(report.comparison.previousMonthKey)}
          value={<ChangeValue comparison={report.comparison} />}
        />
        <FactLine
          draw={ICONS.average}
          label="Average expense"
          detail={`of ${plural(report.count, 'expense', 'expenses')}`}
          value={<Amount paise={report.averagePaise} direction="debit" />}
        />
        <FactLine
          draw={ICONS.highest}
          label="Highest expense"
          detail={`${highest.merchant || highest.purpose || highest.categoryName} · ${formatShortDate(highest.occurredAt)}, ${formatTime(highest.occurredAt)}`}
          value={<Amount paise={highest.amountPaise} direction="debit" />}
          onPress={() => openTransaction(highest.id)}
          last
        />
      </Card>
    );
  }

  function renderList() {
    const rows =
      list === 'category'
        ? report.categories.map((category) => (
            <ShareRow
              key={category.categoryId}
              icon={<CategoryIcon categoryName={category.categoryName} showBadge={false} />}
              name={category.categoryName}
              paise={category.totalPaise}
              count={category.count}
              percent={category.percent}
              value={category.categoryId}
              onPress={openCategory}
            />
          ))
        : report.weeks.map((week) => (
            <ShareRow
              key={week.label}
              icon={<WeekIcon />}
              name={week.label}
              paise={week.totalPaise}
              count={week.count}
              percent={percentOf(week.totalPaise, report.totalPaise)}
            />
          ));
    return (
      <Card>
        {rows.map((row, index) => (
          <View key={row.key} style={index > 0 && styles.rowDivider}>
            {row}
          </View>
        ))}
      </Card>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <MonthSelector monthKey={monthKey} onChange={setMonthKey} />

      {error ? <ErrorState onRetry={reload} /> : null}
      {!report && !error ? <LoadingState /> : null}

      {report ? (
        <>
          <View style={styles.totals}>
            <TotalTile
              label="Spent"
              paise={report.totalPaise}
              direction="debit"
              zeroText="Nothing spent"
              subText={plural(report.count, 'expense', 'expenses')}
            />
            <TotalTile
              label="Received"
              paise={report.receivedPaise}
              direction="credit"
              zeroText="Nothing received"
              subText={plural(report.receivedCount, 'entry', 'entries')}
            />
          </View>

          {report.count === 0 ? (
            <EmptyState
              title="No expenses this month"
              message={`Spending details for ${formatMonthLabel(report.monthKey)} appear once you add an expense.`}
            />
          ) : (
            <>
              {renderSummary()}
              <SegmentedControl options={LISTS} value={list} onChange={setList} />
              {renderList()}
              {list === 'category' ? <Text style={styles.hint}>Tip: tap a category to see its entries.</Text> : null}
            </>
          )}

          {/* Kept apart from the spending figures above: these are not spending or income. */}
          {report.people.people.length > 0 ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle} accessibilityRole="header">
                  Given & Taken
                </Text>
                <TextLink label="View all ›" onPress={() => router.navigate('/given-taken')} />
              </View>
              <View style={styles.totals}>
                <TotalTile
                  label={BALANCE_TEXT.owesYou}
                  paise={report.people.owedToYouPaise}
                  direction="credit"
                  zeroText="Nothing to receive"
                  subText={`from ${plural(report.people.people.filter((p) => p.status === 'owesYou').length, 'person', 'people')}`}
                />
                <TotalTile
                  label={BALANCE_TEXT.youOwe}
                  paise={report.people.youOwePaise}
                  direction="debit"
                  zeroText="Nothing to return"
                  subText={`to ${plural(report.people.people.filter((p) => p.status === 'youOwe').length, 'person', 'people')}`}
                />
              </View>
              <Text style={styles.note}>All time. Not part of spending or income.</Text>
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
  totals: { flexDirection: 'row', gap: spacing.md },
  pressed: { opacity: 0.6 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  // Summary lines, like the form's More details lines.
  fact: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  factIcon: {
    minWidth: 28,
    minHeight: 28,
    maxWidth: 36,
    maxHeight: 36,
    padding: spacing.xs,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  factText: { flex: 1, gap: 2 },
  factLabel: { fontSize: fontSize.sm, color: colors.text, fontWeight: '600' },
  factDetail: { fontSize: fontSize.xs, color: colors.textMuted },
  factRight: { alignItems: 'flex-end', gap: 2 },
  factValueMuted: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textMuted },
  change: { fontSize: fontSize.md, fontWeight: '700', fontVariant: ['tabular-nums'] },
  // By category / By week rows.
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  shareText: { flex: 1, gap: spacing.xs },
  shareLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  shareName: { flex: 1, fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  shareMuted: { fontSize: fontSize.sm, color: colors.textMuted },
  track: { height: 6, borderRadius: radius.pill, backgroundColor: colors.expenseSoft, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.expense },
  // Same circle as CategoryIcon (38 px).
  weekIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  hint: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' },
  section: { gap: spacing.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  note: { fontSize: fontSize.sm, color: colors.textMuted },
});
