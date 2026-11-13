import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';

/**
 * Opens Android's own date or time picker. options: { value, mode, ... } as
 * for DateTimePickerAndroid. onPick(date) runs only when a value is chosen.
 */
export function openPicker(options, onPick) {
  if (Platform.OS !== 'android') {
    return;
  }
  DateTimePickerAndroid.open({
    ...options,
    onChange: (event, picked) => {
      if (event.type === 'set' && picked) {
        onPick(picked);
      }
    },
  });
}

/** A small grey pill showing a date or time; tap it to change. empty: teal text, for "Add date". */
export function DatePill({ text, spokenLabel, onPress, empty = false }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spokenLabel}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
    >
      <Text style={[styles.text, empty && styles.empty]}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.6 },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
  },
  text: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  empty: { color: colors.primary },
});
