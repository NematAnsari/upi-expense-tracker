// More: the less frequent screens, kept off the main tabs so they stay simple.

import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Card } from '../../components/Card';
import { ListRow } from '../../components/ListRow';
import { colors, spacing } from '../../constants/theme';
import { countPendingDetected } from '../../db/detected';
import { useFocusQuery } from '../../hooks/useFocusQuery';

function Divider() {
  return <View style={styles.divider} />;
}

export default function MoreScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const loader = useCallback(async () => ({ pendingCount: await countPendingDetected(db) }), [db]);
  const { data } = useFocusQuery(loader);

  const reviewSubtitle =
    data?.pendingCount > 0 ? `${data.pendingCount} waiting for review` : 'Payments found in your bank SMS';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <ListRow
          title="History"
          subtitle="All expenses and income, with search and filters"
          onPress={() => router.push('/history')}
        />
        <Divider />
        <ListRow title="Review payments" subtitle={reviewSubtitle} onPress={() => router.push('/review-payments')} />
        <Divider />
        <ListRow
          title="Auto-detect settings"
          subtitle="Notification access, battery, alerts"
          onPress={() => router.push('/auto-detect')}
        />
        <Divider />
        <ListRow title="Bank accounts" subtitle="Name your accounts" onPress={() => router.push('/accounts')} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
});
