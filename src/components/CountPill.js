import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius } from '../constants/theme';

/** A small grey rounded badge with a number, such as a month's count or repeat purchases. */
export function CountPill({ count }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.text}>{count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
  text: { fontSize: fontSize.xs, fontWeight: '600', color: colors.textMuted, fontVariant: ['tabular-nums'] },
});
