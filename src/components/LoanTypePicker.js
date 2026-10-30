import { StyleSheet, View } from 'react-native';
import { spacing } from '../constants/theme';
import { loanChoicesFor } from '../domain/loans';
import { Chip } from './Chip';

/**
 * "What is this?" for money paid (Expense / Lent / Paid back) or received
 * (Income / Borrowed / Got paid back). `value` is a loan type or null.
 */
export function LoanTypePicker({ direction, value, onChange }) {
  return (
    <View style={styles.row}>
      {loanChoicesFor(direction).map((choice) => (
        <Chip
          key={choice.label}
          label={choice.label}
          selected={(value ?? null) === choice.value}
          onPress={() => onChange(choice.value)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
