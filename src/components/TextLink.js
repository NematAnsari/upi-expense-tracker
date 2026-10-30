import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, fontSize } from '../constants/theme';

/** A small text-only button for secondary actions ("Edit", "Ignore", "Show message"). */
export function TextLink({ label, onPress, disabled = false, muted = false }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      hitSlop={10}
      style={({ pressed }) => [styles.link, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Text style={[styles.text, muted && styles.muted]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: { minHeight: 44, justifyContent: 'center' },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.4 },
  text: { fontSize: fontSize.md, fontWeight: '600', color: colors.primary },
  muted: { color: colors.textMuted },
});
