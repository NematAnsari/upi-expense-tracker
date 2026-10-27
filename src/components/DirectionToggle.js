import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../constants/theme';

const OPTIONS = [
  { value: 'debit', label: 'Paid', hint: 'Expense', color: colors.expense, soft: colors.expenseSoft },
  { value: 'credit', label: 'Received', hint: 'Income', color: colors.income, soft: colors.incomeSoft },
];

/** Two-way switch between money paid (red) and money received (green). */
export function DirectionToggle({ value, onChange }) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {OPTIONS.map((option) => {
        const selected = (value ?? 'debit') === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`${option.label} (${option.hint})`}
            onPress={() => onChange(option.value)}
            style={[styles.option, selected && { backgroundColor: option.soft, borderColor: option.color }]}
          >
            <Text style={[styles.label, selected && { color: option.color }]}>{option.label}</Text>
            <Text style={styles.hint}>{option.hint}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  option: {
    flex: 1,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  label: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  hint: { fontSize: fontSize.sm, color: colors.textMuted },
});
