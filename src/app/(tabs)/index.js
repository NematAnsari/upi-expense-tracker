// Dashboard: this month's money paid and received, things that need your
// attention, spending by category and the latest transactions.

import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Amount } from '../../components/Amount';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { CategoryBreakdown } from '../../components/CategoryBreakdown';
import { LoanSummaryBar } from '../../components/LoanSummaryBar';
import { MonthSelector } from '../../components/MonthSelector';
import { NoticeBar } from '../../components/NoticeBar';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { TemplateBar } from '../../components/TemplateBar';
import { TransactionRow } from '../../components/TransactionRow';
import { colors, fontSize, spacing } from '../../constants/theme';
import { countPendingDetected } from '../../db/detected';
import { getDashboardData, getLoanBalances } from '../../db/reports';
import { listTemplates } from '../../db/templates';
import { useFocusQuery } from '../../hooks/useFocusQuery';
import { syncDetectedPayments } from '../../services/detection';
import { formatMonthLabel, getMonthKey } from '../../utils/dates';

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

export default function DashboardScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [monthKey, setMonthKey] = useState(getMonthKey());

  const loader = useCallback(async () => {
    // Pick up payments captured while the app was closed before reading totals.
    await syncDetectedPayments(db);
    const [dashboard, templates, pendingCount, loans] = await Promise.all([
      getDashboardData(db, monthKey),
      listTemplates(db),
      countPendingDetected(db),
      getLoanBalances(db),
    ]);
    return { ...dashboard, templates, pendingCount, loans };
  }, [db, monthKey]);
  const { data, error, reload } = useFocusQuery(loader);

  const addTransaction = () => router.push('/transaction/new');
  const addFromTemplate = (template) =>
    router.push({ pathname: '/transaction/new', params: { templateId: template.id } });
  const openTransaction = (id) => router.push({ pathname: '/transaction/[id]', params: { id } });
  const reviewMissingPurpose = () =>
    // `at` makes each tap a new navigation, so History re-applies the filter every time.
    router.navigate({ pathname: '/history', params: { filter: 'missing-purpose', month: monthKey, at: Date.now() } });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <MonthSelector monthKey={monthKey} onChange={setMonthKey} />

      {error ? <ErrorState onRetry={reload} /> : null}
      {!data && !error ? <LoadingState /> : null}

      {data ? (
        <>
          <Card>
            <View style={styles.totalsRow}>
              <View style={styles.totalColumn}>
                <Text style={styles.label}>Spent</Text>
                <Amount paise={data.monthTotals.totalPaise} direction="debit" size="xl" />
              </View>
              <View style={styles.totalColumn}>
                <Text style={styles.label}>Received</Text>
                <Amount paise={data.receivedTotals.totalPaise} direction="credit" size="xl" />
              </View>
            </View>
            <View style={styles.statsRow}>
              <Text style={styles.stat}>
                Spent today: <Amount paise={data.todayTotals.totalPaise} size="md" />
              </Text>
              <Text style={styles.stat}>{plural(data.monthTotals.count, 'expense', 'expenses')}</Text>
            </View>
          </Card>

          {data.pendingCount > 0 ? (
            <NoticeBar
              strong
              message={`${plural(data.pendingCount, 'payment', 'payments')} from bank SMS to review`}
              actionLabel="Review"
              onPress={() => router.push('/review-payments')}
            />
          ) : null}

          <Button label="+ Add transaction" onPress={addTransaction} />

          {data.templates.length > 0 ? (
            <TemplateBar title="Quick add" templates={data.templates} onApply={addFromTemplate} />
          ) : null}

          <LoanSummaryBar
            owedToYouPaise={data.loans.owedToYouPaise}
            youOwePaise={data.loans.youOwePaise}
            onPress={() => router.push('/loans')}
          />

          {data.missingPurposeCount > 0 ? (
            <NoticeBar
              message={`${plural(data.missingPurposeCount, 'expense', 'expenses')} this month without a purpose`}
              actionLabel="Fill in"
              onPress={reviewMissingPurpose}
            />
          ) : null}

          {data.recent.length === 0 ? (
            <Card>
              <EmptyState
                title="Nothing recorded yet"
                message={`No money paid or received in ${formatMonthLabel(monthKey)}.`}
              />
            </Card>
          ) : (
            <>
              {data.categories.length > 0 ? (
                <Card title={`Spending by category · ${formatMonthLabel(monthKey)}`}>
                  <CategoryBreakdown categories={data.categories} />
                </Card>
              ) : null}

              <Card
                title="Latest transactions"
                right={
                  <Pressable accessibilityRole="link" onPress={() => router.navigate('/history')} hitSlop={12}>
                    <Text style={styles.link}>See all</Text>
                  </Pressable>
                }
              >
                {data.recent.map((transaction, index) => (
                  <View key={transaction.id} style={index > 0 && styles.divider}>
                    <TransactionRow transaction={transaction} onPress={() => openTransaction(transaction.id)} />
                  </View>
                ))}
              </Card>
            </>
          )}

          <NoticeBar
            message="Auto-detect payments from bank SMS"
            actionLabel="Settings"
            onPress={() => router.push('/auto-detect')}
          />
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
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  stat: { fontSize: fontSize.sm, color: colors.textMuted },
  link: { fontSize: fontSize.md, color: colors.primary, fontWeight: '600' },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
