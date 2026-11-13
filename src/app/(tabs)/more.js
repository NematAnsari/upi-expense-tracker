// More: the less frequent screens, kept off the main tabs so they stay simple.
//   Review payments stands out on top, since it is the one that needs you.
//   Below it, one card of rows: round icon, title and a short description.

import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Path, Rect } from 'react-native-svg';
import { useAppLock } from '../../components/AppLock';
import { ICONS, OutlineIcon } from '../../components/icons';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { countPendingDetected } from '../../db/detected';
import { useFocusQuery } from '../../hooks/useFocusQuery';

// Same thin outline style as the rest of the app's icons (see components/icons.js).
const STROKE = { fill: 'none', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' };
const DRAW = {
  // An envelope: a message waiting to be looked at.
  review: (c) => <Path d="M4 6h16v12H4zM4 7l8 6 8-6" stroke={c} {...STROKE} />,
  history: ICONS.oldest,
  // A cup with steam.
  shops: (c) => (
    <Path
      d="M5 8h11v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V8zM16 9h1.5a2.5 2.5 0 0 1 0 5H16M8 3v2M12 3v2"
      stroke={c}
      {...STROKE}
    />
  ),
  banks: ICONS.bank,
  // A bell.
  detection: (c) => <Path d="M18 16v-5a6 6 0 1 0-12 0v5l-2 2h16l-2-2zM10 21h4" stroke={c} {...STROKE} />,
  // A tray with a down arrow.
  backup: (c) => <Path d="M12 4v10M8 10l4 4 4-4M5 19h14" stroke={c} {...STROKE} />,
  // A padlock.
  lock: (c) => (
    <>
      <Rect x={5} y={10.5} width={14} height={10} rx={2} stroke={c} {...STROKE} />
      <Path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" stroke={c} {...STROKE} />
    </>
  ),
};

// The rows under the Review banner, in order.
const ROWS = [
  { key: 'history', title: 'History', subtitle: 'All expenses and income, with search and filters', route: '/history' },
  { key: 'shops', title: 'Shop accounts', subtitle: 'Take now, pay later, like tea paid monthly', route: '/shops' },
  { key: 'banks', title: 'Bank accounts', subtitle: 'Name your accounts', route: '/accounts' },
  {
    key: 'detection',
    title: 'Payment detection',
    subtitle: 'Notification access, battery, alerts',
    route: '/auto-detect',
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
  const waiting = data?.pendingCount ?? 0;
  const reviewSubtitle = waiting > 0 ? `${waiting} waiting for you` : 'All caught up';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Review payments, ${reviewSubtitle}`}
        onPress={() => router.push('/review-payments')}
        style={({ pressed }) => [styles.featured, pressed && styles.pressed]}
      >
        <View style={styles.featuredIcon}>
          <OutlineIcon draw={DRAW.review} color={colors.onPrimary} size={22} />
        </View>
        <View style={styles.main}>
          <Text style={styles.featuredTitle}>Review payments</Text>
          <Text style={styles.featuredSub}>{reviewSubtitle}</Text>
        </View>
        <Text style={styles.featuredChevron}>›</Text>
      </Pressable>

      <View style={styles.card}>
        {ROWS.map((row, index) => (
          <View key={row.key}>
            {/* The line starts at the text, not under the icon. */}
            {index > 0 ? <View style={styles.divider} /> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={row.title}
              onPress={() => router.push(row.route)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <View style={styles.glyph}>
                <OutlineIcon draw={DRAW[row.key]} color={colors.primary} size={18} />
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
  glyph: {
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
