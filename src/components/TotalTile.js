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

/** A small grey rounded badge with a number, such as the month's count. */
function CountPill({ count }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillText}>{count}</Text>
    </View>
  );
}

/**
 * One total in a white tile, with a + in the corner so you see you can add to it:
 *   Spent (18)          (+)      Money to receive  (+)
 *   ₹12,400.00                   ₹57,000.00
 *   Today ₹200.00 (3)            Given today ₹500.00
 * At ₹0 it shows zeroText ("Nothing to receive") instead. The whole tile is the button.
 * Without onPress it is a plain tile (no +), as on the Reports tab.
 * count / subCount: optional grey pills after the title and after subText
 * (0 or missing = no pill).
 * Used side by side; fixed-height slots keep two tiles lined up row by row.
 * direction: 'credit' (green) or 'debit' (red). action: what tapping does, for screen readers.
 */
export function TotalTile({ label, count, paise, direction, action, zeroText, subText, subCount, onPress }) {
  const color = direction === 'credit' ? colors.income : colors.expense;
  const soft = direction === 'credit' ? colors.incomeSoft : colors.expenseSoft;
  const showSub = paise > 0 && Boolean(subText);
  const content = (
    <>
      <View style={[styles.header, onPress && styles.headerWithPlus]}>
        <Text style={styles.label} numberOfLines={2}>
          {label}
        </Text>
        {count > 0 ? <CountPill count={count} /> : null}
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
      <View style={styles.subLine}>
        <Text style={styles.subText} numberOfLines={1}>
          {showSub ? subText : ' '}
        </Text>
        {showSub && subCount > 0 ? <CountPill count={subCount} /> : null}
      </View>
    </>
  );
  if (!onPress) {
    return <View style={styles.tile}>{content}</View>;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}${count > 0 ? `, ${count} this month` : ''}, ${action}`}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
    >
      <CornerPlus color={color} soft={soft} />
      {content}
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
  // Room for a two-line title.
  header: { minHeight: 36, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  // Keeps the title clear of the corner +.
  headerWithPlus: { paddingRight: 32 },
  label: { flexShrink: 1, fontSize: fontSize.sm, lineHeight: 18, color: colors.textMuted },
  amountSlot: { height: 30, justifyContent: 'center' },
  zero: { fontSize: fontSize.md, fontWeight: '600', color: colors.textMuted },
  subLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, height: 18 },
  subText: { flexShrink: 1, fontSize: fontSize.sm, lineHeight: 18, color: colors.textMuted },
  pill: {
    minWidth: 20,
    height: 18,
    paddingHorizontal: 6,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  pillText: { fontSize: fontSize.xs, fontWeight: '600', color: colors.textMuted, fontVariant: ['tabular-nums'] },
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
