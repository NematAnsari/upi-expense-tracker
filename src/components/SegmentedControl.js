import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../constants/theme';

/**
 * Tabs inside a screen, side by side ("Money given | Money taken").
 * options: [{ value, label }]. The selected one is filled white on a grey track.
 */
export function SegmentedControl({ options, value, onChange }) {
  return (
    <View style={styles.track} accessibilityRole="tablist">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected && styles.selected]}
          >
            <Text style={[styles.label, selected && styles.selectedLabel]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: spacing.xs,
    gap: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.border,
  },
  segment: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  selected: { backgroundColor: colors.surface },
  label: { fontSize: fontSize.md, fontWeight: '600', color: colors.textMuted },
  selectedLabel: { color: colors.text },
});
