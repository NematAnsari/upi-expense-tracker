import { StyleSheet, TextInput } from 'react-native';
import { colors, fontSize, radius, spacing } from '../constants/theme';

/** The app's standard text box. Pass `error` to show a red border. */
export function TextField({ error, style, ...props }) {
  return (
    <TextInput
      placeholderTextColor={colors.textMuted}
      style={[styles.input, error && styles.inputError, style]}
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.md,
    color: colors.text,
  },
  inputError: { borderColor: colors.danger },
});
