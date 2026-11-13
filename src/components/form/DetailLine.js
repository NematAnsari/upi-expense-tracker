import { Children } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, spacing } from '../../constants/theme';

/**
 * A labelled line inside the form's Details card: label on the left, the first
 * child (the input) on the right, any other children (suggestions) underneath.
 */
export function DetailLine({ label, required, children, error, last }) {
  const [input, ...below] = Children.toArray(children);
  return (
    <View style={[styles.detail, !last && styles.border]}>
      <View style={styles.line}>
        <Text style={styles.label}>
          {label}
          {required ? <Text style={styles.required}> *</Text> : null}
        </Text>
        {input}
      </View>
      {below}
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  detail: { paddingVertical: spacing.sm, gap: spacing.sm },
  border: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 40 },
  label: { width: 130, fontSize: fontSize.sm, color: colors.textMuted },
  required: { color: colors.danger },
  error: { fontSize: fontSize.sm, color: colors.danger },
});
