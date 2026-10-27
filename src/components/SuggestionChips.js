import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { colors, fontSize, radius, spacing } from '../constants/theme';

/** A row of tappable suggestions under a text field. Renders nothing when empty. */
export function SuggestionChips({ suggestions, onPick, label }) {
  if (suggestions.length === 0) {
    return null;
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.row}
    >
      {suggestions.map((suggestion) => (
        <Pressable
          key={suggestion.value}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${suggestion.value}`}
          onPress={() => onPick(suggestion)}
          hitSlop={4}
          style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
        >
          <Text style={styles.text} numberOfLines={1}>
            {suggestion.value}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm },
  chip: {
    minHeight: 36,
    maxWidth: 220,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
  text: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '600' },
});
