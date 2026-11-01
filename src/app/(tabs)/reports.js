// Monthly report: totals, comparison with last month, highest and average
// expense, spending per category and per week. Amounts: red paid, green received.
// Money given and taken is never part of these; it gets its own card at the end.

import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Amount } from '../../components/Amount';
import { Card } from '../../components/Card';
import { CategoryBreakdown } from '../../components/CategoryBreakdown';
import { MonthSelector } from '../../components/MonthSelector';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { colors, fontSize, spacing } from '../../constants/theme';
import { TextLink } from '../../components/TextLink';
import { getLoanBalances, getMonthlyReport } from '../../db/reports';
import { BALANCE_TEXT } from '../../domain/loans';
import { useFocusQuery } from '../../hooks/useFocusQuery';
import { formatDateTime, formatMonthLabel, getMonthKey } from '../../utils/dates';
import { formatPercent } from '../../utils/money';

function Stat({ label, children, detail }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      {children}
      {detail ? (
        <Text style={styles.statDetail} numberOfLines={2}>
          {detail}
        </Text>
      ) : null}
    </View>
  );
}

/** "₹500.00 more than September 2026 (₹2,000.00)". More spending is red, less is green. */
function SpendingComparison({ comparison }) {
  const { previousMonthKey, previousTotalPaise, changePaise, changePercent } = comparison;
  const previousLabel = formatMonthLabel(previousMonthKey);

  if (previousTotalPaise === 0) {
    return <Text style={styles.comparison}>Nothing spent in {previousLabel} to compare with.</Text>;
  }
  if (changePaise === 0) {
    return (
      <Text style={styles.comparison}>
        {`Same as ${previousLabel} (`}
        <Amount paise={previousTotalPaise} size="sm" bold={false} />
        {').'}
      </Text>
    );
  }
  const spentMore = changePaise > 0;
  const changeColor = spentMore ? colors.expense : colors.income;
  return (
    <Text style={styles.comparison}>
      <Text style={[styles.change, { color: changeColor }]}>
        {spentMore ? '▲ ' : '▼ '}
        <Amount paise={Math.abs(changePaise)} size="sm" style={{ color: changeColor }} />
        {` ${spentMore ? 'more' : 'less'} (${formatPercent(Math.abs(changePercent))})`}
      </Text>
      {` than ${previousLabel} (`}
      <Amount paise={previousTotalPaise} size="sm" bold={false} />
      {').'}
    </Text>
  );
}

export default function ReportsScreen() {
  const db = useSQLiteContext();
  const [monthKey, setMonthKey] = useState(getMonthKey());

  const router = useRouter();
  const loader = useCallback(async () => {
    const [monthly, people] = await Promise.all([getMonthlyReport(db, monthKey), getLoanBalances(db)]);
    return { ...monthly, people };
  }, [db, monthKey]);
  const { data: report, error, reload } = useFocusQuery(loader);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <MonthSelector monthKey={monthKey} onChange={setMonthKey} />

      {error ? <ErrorState onRetry={reload} /> : null}
      {!report && !error ? <LoadingState /> : null}

      {report ? (
        <>
          <Card>
            <View style={styles.totalsRow}>
              <View style={styles.totalColumn}>
                <Text style={styles.label}>Spent</Text>
                <Amount paise={report.totalPaise} direction="debit" size="xl" />
              </View>
              <View style={styles.totalColumn}>
                <Text style={styles.label}>Received</Text>
                <Amount paise={report.receivedPaise} direction="credit" size="xl" />
              </View>
            </View>
            <View style={styles.comparisonRow}>
              <SpendingComparison comparison={report.comparison} />
            </View>
          </Card>

          {report.count === 0 ? (
            <Card>
              <EmptyState
                title="No expenses this month"
                message={`Spending details for ${formatMonthLabel(report.monthKey)} appear once you add an expense.`}
              />
            </Card>
          ) : (
            <>
              <Card title="Expense summary">
                <View style={styles.statsGrid}>
                  <Stat label="Number of expenses">
                    <Text style={styles.statValue}>{report.count}</Text>
                  </Stat>
                  <Stat label="Average expense">
                    <Amount paise={report.averagePaise} size="lg" />
                  </Stat>
                </View>
                <View style={[styles.statsGrid, styles.statsGridSpaced]}>
                  <Stat
                    label="Highest expense"
                    detail={`${report.highest.purpose || report.highest.merchant || report.highest.categoryName} · ${formatDateTime(report.highest.occurredAt)}`}
                  >
                    <Amount paise={report.highest.amountPaise} size="lg" />
                  </Stat>
                </View>
              </Card>

              <Card title="Spending by category">
                <CategoryBreakdown categories={report.categories} />
              </Card>

              <Card title="Spending by week">
                {report.weeks.map((week) => (
                  <View key={week.label} style={styles.weekRow}>
                    <Text style={styles.weekLabel}>{week.label}</Text>
                    <Text style={styles.weekCount}>
                      {week.count} {week.count === 1 ? 'expense' : 'expenses'}
                    </Text>
                    <Amount paise={week.totalPaise} style={styles.weekAmount} />
                  </View>
                ))}
              </Card>
            </>
          )}

          {/* Kept apart from the spending figures above: these are not spending or income. */}
          {report.people.people.length > 0 ? (
            <Card
              title="Money given and taken"
              right={<TextLink label="Details" onPress={() => router.navigate('/given-taken')} />}
            >
              <View style={styles.totalsRow}>
                <View style={styles.totalColumn}>
                  <Text style={styles.label}>{BALANCE_TEXT.owesYou}</Text>
                  <Amount paise={report.people.owedToYouPaise} direction="credit" size="lg" />
                </View>
                <View style={styles.totalColumn}>
                  <Text style={styles.label}>{BALANCE_TEXT.youOwe}</Text>
                  <Amount paise={report.people.youOwePaise} direction="debit" size="lg" />
                </View>
              </View>
              <Text style={styles.peopleNote}>All time. Not included in the spending and income figures.</Text>
            </Card>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg },
  totalsRow: { flexDirection: 'row', gap: spacing.lg },
  totalColumn: { flex: 1, gap: spacing.xs },
  label: { fontSize: fontSize.sm, color: colors.textMuted },
  comparisonRow: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  comparison: { fontSize: fontSize.sm, color: colors.textMuted },
  change: { fontWeight: '700' },
  statsGrid: { flexDirection: 'row', gap: spacing.lg },
  statsGridSpaced: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  stat: { flex: 1, gap: 2 },
  statLabel: { fontSize: fontSize.sm, color: colors.textMuted },
  statValue: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  statDetail: { fontSize: fontSize.sm, color: colors.textMuted },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  weekLabel: { flex: 1, fontSize: fontSize.md, color: colors.text },
  weekCount: { fontSize: fontSize.sm, color: colors.textMuted },
  weekAmount: { width: 110, textAlign: 'right' },
  peopleNote: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.md },
});
