import { StyleSheet, Text } from 'react-native';
import { amountColor, fontSize } from '../constants/theme';
import { formatINR } from '../utils/money';

/**
 * Shows an amount in the app's money colours: red for money paid ('debit'),
 * green for money received ('credit'). Use this for every amount on screen.
 *
 * showSign adds "−" or "+" in front (useful in mixed lists).
 * size: 'sm' | 'md' | 'lg' | 'xl' | 'xxl'
 */
export function Amount({ paise, direction = 'debit', showSign = false, size = 'md', bold = true, style }) {
  const sign = showSign ? (direction === 'credit' ? '+' : '−') : '';
  return (
    <Text
      style={[styles.amount, { color: amountColor(direction), fontSize: fontSize[size] }, bold && styles.bold, style]}
    >
      {sign}
      {formatINR(paise)}
    </Text>
  );
}

const styles = StyleSheet.create({
  amount: { fontVariant: ['tabular-nums'] },
  bold: { fontWeight: '700' },
});
