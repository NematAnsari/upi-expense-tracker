import { Pressable, StyleSheet, Text } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { colors, fontSize, spacing } from '../constants/theme';

const ACTION_WIDTH = 96;

/** The button revealed behind a row. Tapping it closes the row, then runs the action. */
function SwipeAction({ action, methods }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action.label}
      onPress={() => {
        methods.close();
        action.onPress();
      }}
      style={({ pressed }) => [styles.action, { backgroundColor: action.color }, pressed && styles.pressed]}
    >
      <Text style={styles.actionText} numberOfLines={2}>
        {action.label}
      </Text>
    </Pressable>
  );
}

/**
 * Any row you can swipe to reveal a button.
 * leftAction: shown when swiping right. rightAction: shown when swiping left.
 * Each is { label, color, onPress } or null for no button on that side.
 * background: the colour behind the row, so the buttons stay hidden until swiped.
 */
export function SwipeableRow({ leftAction, rightAction, background = colors.surface, children }) {
  if (!leftAction && !rightAction) {
    return children;
  }
  return (
    <ReanimatedSwipeable
      friction={2}
      leftThreshold={ACTION_WIDTH / 2}
      rightThreshold={ACTION_WIDTH / 2}
      overshootLeft={false}
      overshootRight={false}
      childrenContainerStyle={{ backgroundColor: background }}
      renderLeftActions={
        leftAction
          ? (progress, translation, methods) => <SwipeAction action={leftAction} methods={methods} />
          : undefined
      }
      renderRightActions={
        rightAction
          ? (progress, translation, methods) => <SwipeAction action={rightAction} methods={methods} />
          : undefined
      }
    >
      {children}
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  action: {
    width: ACTION_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  pressed: { opacity: 0.8 },
  actionText: { fontSize: fontSize.md, fontWeight: '700', color: colors.onPrimary, textAlign: 'center' },
});
