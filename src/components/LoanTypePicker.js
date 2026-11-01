import { StyleSheet, View } from 'react-native';
import { spacing } from '../constants/theme';
import { loanChoicesFor } from '../domain/loans';
import { Chip } from './Chip';

/**
 * "What is this?" on a review card. Money paid: Expense / I gave money / Money returned.
 * Money received: Income / I took money / Money received back.
 * `value` is a loan type or null.
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
