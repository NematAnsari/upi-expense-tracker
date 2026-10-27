import { StyleSheet, Text, TextInput, View } from 'react-native';
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

/** A label above a control, with an optional required star and error message below. */
export function FormField({ label, required = false, error, children }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      {children}
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export const inputStyle = {
  minHeight: 48,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: radius.sm,
  backgroundColor: colors.surface,
  paddingHorizontal: spacing.md,
  fontSize: fontSize.md,
  color: colors.text,
};

const styles = StyleSheet.create({
  input: inputStyle,
  inputError: { borderColor: colors.danger },
  field: { gap: spacing.sm },
  label: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  required: { color: colors.danger },
  error: { fontSize: fontSize.sm, color: colors.danger },
});
