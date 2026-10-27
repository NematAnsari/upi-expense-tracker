import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, fontSize, radius, spacing } from '../constants/theme';

/**
 * A tappable strip with a message and an action word, e.g.
 * "2 payments to review        Review". `strong` uses the brand colour.
 */
export function NoticeBar({ message, actionLabel, onPress, strong = false }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${message}. ${actionLabel}`}
      onPress={onPress}
      style={({ pressed }) => [styles.bar, strong && styles.strong, pressed && styles.pressed]}
    >
      <Text style={[styles.message, strong && styles.strongText]}>{message}</Text>
      <Text style={[styles.action, strong && styles.strongText]}>{actionLabel}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 48,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
  strong: { backgroundColor: colors.primary },
  pressed: { opacity: 0.75 },
  message: { flex: 1, fontSize: fontSize.md, color: colors.text },
  action: { fontSize: fontSize.md, fontWeight: '700', color: colors.primary },
  strongText: { color: colors.onPrimary },
});
