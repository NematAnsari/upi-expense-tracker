import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, spacing } from '../constants/theme';

/** A plain tappable row: title, optional subtitle (text or element) and a chevron. */
export function ListRow({ title, subtitle, onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.main}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingVertical: spacing.md,
  },
  pressed: { opacity: 0.6 },
  main: { flex: 1, gap: 2 },
  title: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  subtitle: { fontSize: fontSize.sm, color: colors.textMuted },
  chevron: { fontSize: 24, color: colors.textMuted },
});
