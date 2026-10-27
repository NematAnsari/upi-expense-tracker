import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../constants/theme';

/**
 * A small rounded button used for choices and filters.
 * `accessory` is shown after the label (e.g. an <Amount />).
 */
export function Chip({ label, selected = false, onPress, onLongPress, accessory }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      onLongPress={onLongPress}
      hitSlop={4}
      style={[styles.chip, selected && styles.selected]}
    >
      <View style={styles.content}>
        <Text style={[styles.text, selected && styles.selectedText]}>{label}</Text>
        {accessory}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  selected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  text: { fontSize: fontSize.sm, color: colors.text },
  selectedText: { color: colors.onPrimary, fontWeight: '600' },
});
