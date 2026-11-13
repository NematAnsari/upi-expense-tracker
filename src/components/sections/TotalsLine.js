import { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { colors, fontSize } from '../../constants/theme';
import { Amount } from '../basics/Amount';

function totalOf(entries, direction) {
  return entries.filter((entry) => entry.direction === direction).reduce((sum, entry) => sum + entry.amountPaise, 0);
}

/** "3 entries · Spent ₹500.00 · Received ₹200.00" for a list of expenses and income. */
export function TotalsLine({ entries, countText, style }) {
  const spentPaise = useMemo(() => totalOf(entries, 'debit'), [entries]);
  const receivedPaise = useMemo(() => totalOf(entries, 'credit'), [entries]);
  return (
    <Text style={[styles.line, style]}>
      {`${countText} · Spent `}
      <Amount paise={spentPaise} direction="debit" size="sm" />
      {' · Received '}
      <Amount paise={receivedPaise} direction="credit" size="sm" />
    </Text>
  );
}

const styles = StyleSheet.create({
  line: { fontSize: fontSize.sm, color: colors.textMuted },
});
