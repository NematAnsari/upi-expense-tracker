import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../constants/theme';

const VISIBLE_MS = 6000;

/**
 * A bar at the bottom of the screen: "Added ₹1.00   UNDO".
 * `action` is { id, message, undo } or null. It hides itself after a few seconds.
 */
export function UndoBar({ action, onUndo, onHide }) {
  useEffect(() => {
    if (!action) {
      return undefined;
    }
    const timer = setTimeout(onHide, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [action, onHide]);

  if (!action) {
    return null;
  }
  return (
    <View style={styles.bar} accessibilityLiveRegion="polite">
      <Text style={styles.message} numberOfLines={2}>
        {action.message}
      </Text>
      <Pressable accessibilityRole="button" onPress={onUndo} hitSlop={12} style={styles.undo}>
        <Text style={styles.undoText}>UNDO</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.text,
  },
  message: { flex: 1, fontSize: fontSize.md, color: colors.surface },
  undo: { minHeight: 44, justifyContent: 'center' },
  undoText: { fontSize: fontSize.md, fontWeight: '700', color: colors.primaryOnDark },
});
