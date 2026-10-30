import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { Amount } from './Amount';

/** "Others owe you ₹500.00 · You owe ₹200.00   Loans" — opens the Loans screen. */
export function LoanSummaryBar({ owedToYouPaise, youOwePaise, onPress }) {
  const hasLoans = owedToYouPaise > 0 || youOwePaise > 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Loans: money lent and borrowed"
      onPress={onPress}
      style={({ pressed }) => [styles.bar, pressed && styles.pressed]}
    >
      <View style={styles.main}>
        {hasLoans ? (
          <>
            <Text style={styles.line}>
              Others owe you <Amount paise={owedToYouPaise} direction="credit" size="md" />
            </Text>
            <Text style={styles.line}>
              You owe <Amount paise={youOwePaise} direction="debit" size="md" />
            </Text>
          </>
        ) : (
          <Text style={styles.line}>Track money you lend or borrow</Text>
        )}
      </View>
      <Text style={styles.action}>Loans</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 48,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
  pressed: { opacity: 0.75 },
  main: { flex: 1, gap: 2 },
  line: { fontSize: fontSize.md, color: colors.text },
  action: { fontSize: fontSize.md, fontWeight: '700', color: colors.primary },
});
