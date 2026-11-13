// More: the less frequent screens, kept off the main tabs so they stay simple.
//   Review payments stands out on top, since it is the one that needs you.
//   Below it, one card of rows: round icon, title and a short description.

import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAppLock } from '../../components/wrappers/AppLockProvider';
import { ICONS, OutlineIcon } from '../../components/icons/icons';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { countPendingDetected } from '../../db/detected';
import { useFocusQuery } from '../../hooks/useFocusQuery';

// Each row's icon (shared drawings from icons.js).
const MENU_ICONS = {
  review: ICONS.envelope,
  history: ICONS.oldest,
  shops: ICONS.cup,
  banks: ICONS.bank,
  detection: ICONS.bell,
  backup: ICONS.download,
  lock: ICONS.lock,
};

// The rows under the Review banner, in order.
const MENU_ROWS = [
  { key: 'history', title: 'History', subtitle: 'All expenses and income, with search and filters', route: '/history' },
  { key: 'shops', title: 'Shop accounts', subtitle: 'Take now, pay later, like tea paid monthly', route: '/shops' },
  { key: 'banks', title: 'Bank accounts', subtitle: 'Name your accounts', route: '/bank-accounts' },
  {
    key: 'detection',
    title: 'Payment detection',
    subtitle: 'Notification access, battery, alerts',
    route: '/payment-detection',
  },
  {
    key: 'backup',
    title: 'Backup & restore',
    subtitle: 'Save your data to a file, or bring it back',
    route: '/backup',
  },
  // Its line says whether the lock is on (see lockSubtitle).
  { key: 'lock', title: 'App lock', subtitle: '', route: '/app-lock' },
];

export default function MoreScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const loader = useCallback(async () => ({ pendingCount: await countPendingDetected(db) }), [db]);
  const { data } = useFocusQuery(loader);

  const { enabled: lockOn } = useAppLock();
  const lockSubtitle = lockOn ? 'On: asks for your fingerprint or phone PIN' : 'Off: open the app without unlocking';
  const pendingCount = data?.pendingCount ?? 0;
  const reviewSubtitle = pendingCount > 0 ? `${pendingCount} waiting for you` : 'All caught up';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Review payments, ${reviewSubtitle}`}
        onPress={() => router.push('/review-payments')}
        style={({ pressed }) => [styles.featured, pressed && styles.pressed]}
      >
        <View style={styles.featuredIcon}>
          <OutlineIcon draw={MENU_ICONS.review} color={colors.onPrimary} size={22} />
        </View>
        <View style={styles.main}>
          <Text style={styles.featuredTitle}>Review payments</Text>
          <Text style={styles.featuredSub}>{reviewSubtitle}</Text>
        </View>
        <Text style={styles.featuredChevron}>›</Text>
      </Pressable>

      <View style={styles.card}>
        {MENU_ROWS.map((row, index) => (
          <View key={row.key}>
            {/* The line starts at the text, not under the icon. */}
            {index > 0 ? <View style={styles.divider} /> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={row.title}
              onPress={() => router.push(row.route)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <View style={styles.iconCircle}>
                <OutlineIcon draw={MENU_ICONS[row.key]} color={colors.primary} size={18} />
              </View>
              <View style={styles.main}>
                <Text style={styles.title}>{row.title}</Text>
                <Text style={styles.subtitle}>{row.key === 'lock' ? lockSubtitle : row.subtitle}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  pressed: { opacity: 0.6 },
  main: { flex: 1, gap: 2 },
  featured: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
  },
  featuredIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  featuredTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.onPrimary },
  featuredSub: { fontSize: fontSize.sm, color: 'rgba(255, 255, 255, 0.85)' },
  featuredChevron: { fontSize: 24, color: colors.onPrimary },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 36 + spacing.md, backgroundColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 60, paddingVertical: spacing.sm },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  title: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  subtitle: { fontSize: fontSize.sm, color: colors.textMuted },
  chevron: { fontSize: 24, color: colors.textMuted },
});
