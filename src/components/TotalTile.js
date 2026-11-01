import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { Amount } from './Amount';

/**
 * A "+" on a pale quarter circle filling the tile's top-right corner: one
 * smooth curve, no straight bottom edge. The + sits towards the corner, where
 * the shape is widest. Drawn with views (no icon font).
 */
function CornerPlus({ color, soft }) {
  return (
    <View style={[styles.cornerTab, { backgroundColor: soft }]}>
      <View style={styles.plusMark}>
        <View style={[styles.plusBarAcross, { backgroundColor: color }]} />
        <View style={[styles.plusBarDown, { backgroundColor: color }]} />
      </View>
    </View>
  );
}

/**
 * One total in a white tile, with a + in the corner so you see you can add to it:
 *   Money to receive  (+)        Spent  (+)
 *   ₹57,000.00                   ₹12,400.00
 *   from 3 people                18 expenses
 * At ₹0 it shows zeroText ("Nothing to receive") instead. The whole tile is the button.
 * Used side by side on the Expenses and Given & Taken tabs; fixed-height slots
 * keep two tiles lined up row by row.
 * direction: 'credit' (green) or 'debit' (red). action: what tapping does, for screen readers.
 */
export function TotalTile({ label, paise, direction, action, zeroText, subText, onPress }) {
  const color = direction === 'credit' ? colors.income : colors.expense;
  const soft = direction === 'credit' ? colors.incomeSoft : colors.expenseSoft;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${action}`}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
    >
      <CornerPlus color={color} soft={soft} />
      <View style={styles.header}>
        <Text style={styles.label} numberOfLines={2}>
          {label}
        </Text>
      </View>
      <View style={styles.amountSlot}>
        {paise > 0 ? (
          <Amount paise={paise} direction={direction} size="xl" />
        ) : (
          <Text style={styles.zero} numberOfLines={1}>
            {zeroText}
          </Text>
        )}
      </View>
      <Text style={styles.subText} numberOfLines={1}>
        {paise > 0 ? subText : ' '}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    // Clips the corner tab to the tile's rounded corner.
    overflow: 'hidden',
  },
  pressed: { opacity: 0.7 },
  // Room for a two-line title; the right padding keeps it clear of the corner +.
  header: { minHeight: 36, paddingRight: 32 },
  label: { fontSize: fontSize.sm, lineHeight: 18, color: colors.textMuted },
  amountSlot: { height: 30, justifyContent: 'center' },
  zero: { fontSize: fontSize.md, fontWeight: '600', color: colors.textMuted },
  subText: { fontSize: fontSize.sm, lineHeight: 18, height: 18, color: colors.textMuted },
  // A quarter circle: the bottom-left radius equals the size.
  cornerTab: { position: 'absolute', top: 0, right: 0, width: 42, height: 42, borderBottomLeftRadius: 42 },
  plusMark: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusBarAcross: { position: 'absolute', width: 13, height: 2.5, borderRadius: 1 },
  plusBarDown: { position: 'absolute', width: 2.5, height: 13, borderRadius: 1 },
});
