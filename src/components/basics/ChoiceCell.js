import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { OutlineIcon } from '../icons/icons';

/**
 * One choice in a row of icons (categories, payment methods, Filters): the icon
 * (children), then a short label; teal when selected. Grows with its label
 * between a min and max width.
 * spokenLabel: what screen readers hear (default: label).
 * teal: teal text without the selected background (the "+ New" choice).
 */
export function ChoiceCell({ label, spokenLabel = label, selected, teal = false, onPress, style, children }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spokenLabel}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.cell, style, selected && styles.cellSelected]}
    >
      {children}
      <Text style={[styles.text, (selected || teal) && styles.textTeal]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** An outline icon in the small grey circle used by the choices. dashed: the "+ New" look. */
export function IconInCircle({ draw, color, dashed = false }) {
  return (
    <View style={[styles.circle, dashed && styles.circleDashed]}>
      <OutlineIcon draw={draw} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  cell: {
    minWidth: 60,
    maxWidth: 96,
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
  },
  cellSelected: { backgroundColor: colors.primarySoft },
  text: { fontSize: fontSize.xs, color: colors.textMuted, textAlign: 'center', paddingHorizontal: 2 },
  textTeal: { color: colors.primary, fontWeight: '700' },
  // Same size as a small CategoryIcon.
  circle: {
    minWidth: 28,
    minHeight: 28,
    maxWidth: 36,
    maxHeight: 36,
    padding: spacing.xs,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  circleDashed: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary },
});
