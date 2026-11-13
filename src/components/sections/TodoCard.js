import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ICONS, OutlineIcon } from '../icons/icons';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { CountPill } from '../basics/CountPill';

// The Expenses tab's to-do card: payments waiting for review, bank messages
// that stopped coming, expenses with no purpose yet, and a backup that is due.

const TODO_ICONS = {
  review: ICONS.envelope,
  purpose: ICONS.pencil,
  detection: ICONS.bell,
  backup: ICONS.download,
};

/**
 * One card of reminders: each is a line with a round icon, its title and
 * count, and the action on the right. Nothing shows when there is nothing to do.
 *   (✉) Payments to review (3)        Review ›
 *   (✎) Need a purpose (5)               Add ›
 * items: [{ key, icon: 'review' | 'detection' | 'purpose' | 'backup', title,
 * count (optional), action, message, onPress }]. Review is teal; the rest amber.
 */
export function TodoCard({ items }) {
  if (items.length === 0) {
    return null;
  }
  return (
    <View style={styles.card}>
      {items.map((item, index) => (
        <Pressable
          key={item.key}
          accessibilityRole="button"
          accessibilityLabel={`${item.message}. ${item.action}`}
          onPress={item.onPress}
          style={({ pressed }) => [styles.line, index > 0 && styles.border, pressed && styles.pressed]}
        >
          <View style={[styles.icon, item.icon === 'review' ? styles.iconReview : styles.iconAmber]}>
            <OutlineIcon
              draw={TODO_ICONS[item.icon]}
              color={item.icon === 'review' ? colors.primary : colors.warning}
              size={16}
              strokeWidth={1.8}
            />
          </View>
          <View style={styles.titleWrap}>
            <Text style={styles.title} numberOfLines={1}>
              {item.title}
            </Text>
            {item.count != null ? <CountPill count={item.count} /> : null}
          </View>
          <Text style={styles.action}>{`${item.action} ›`}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.6 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52, paddingVertical: spacing.sm },
  border: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  icon: { width: 32, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  iconReview: { backgroundColor: colors.primarySoft },
  iconAmber: { backgroundColor: colors.warningSoft },
  titleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  title: { flexShrink: 1, fontSize: fontSize.md, color: colors.text },
  action: { fontSize: fontSize.md, fontWeight: '600', color: colors.primary },
});
