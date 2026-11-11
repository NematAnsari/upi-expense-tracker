import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { CountPill } from './CountPill';

// The Expenses tab's to-do card: payments waiting for review, bank messages
// that stopped coming, expenses with no purpose yet, and a backup that is due.

const STROKE = { fill: 'none', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
const DRAW = {
  // An envelope: a message waiting to be looked at.
  review: (c) => <Path d="M4 6h16v12H4zM4 7l8 6 8-6" stroke={c} {...STROKE} />,
  // A pencil: something to fill in.
  purpose: (c) => <Path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" stroke={c} {...STROKE} />,
  // A bell: payment detection may have stopped.
  detection: (c) => <Path d="M18 16v-5a6 6 0 1 0-12 0v5l-2 2h16l-2-2zM10 21h4" stroke={c} {...STROKE} />,
  // A tray with a down arrow: save a backup.
  backup: (c) => <Path d="M12 4v10M8 10l4 4 4-4M5 19h14" stroke={c} {...STROKE} />,
};

function Icon({ name, color, size = 16 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      {DRAW[name](color)}
    </Svg>
  );
}

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
          style={({ pressed }) => [styles.todo, index > 0 && styles.todoBorder, pressed && styles.pressed]}
        >
          <View style={[styles.todoIcon, item.icon === 'review' ? styles.iconReview : styles.iconPurpose]}>
            <Icon name={item.icon} color={item.icon === 'review' ? colors.primary : colors.warning} />
          </View>
          <View style={styles.todoTitle}>
            <Text style={styles.todoText} numberOfLines={1}>
              {item.title}
            </Text>
            {item.count != null ? <CountPill count={item.count} /> : null}
          </View>
          <Text style={styles.todoAction}>{`${item.action} ›`}</Text>
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
  todo: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52, paddingVertical: spacing.sm },
  todoBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  todoIcon: { width: 32, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  iconReview: { backgroundColor: colors.primarySoft },
  iconPurpose: { backgroundColor: colors.warningSoft },
  todoTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  todoText: { flexShrink: 1, fontSize: fontSize.md, color: colors.text },
  todoAction: { fontSize: fontSize.md, fontWeight: '600', color: colors.primary },
});
