import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { colors, fontSize, radius, spacing } from '../../constants/theme';

/**
 * A sheet that slides up from the bottom over a dimmed screen, with a handle
 * and a title. Tapping the dimmed part closes it.
 * closeLabel: what screen readers hear for the dimmed part.
 * aboveKeyboard: keep the sheet above the keyboard (for sheets you type in).
 * style: extra sheet style, such as a wider gap.
 */
export function BottomSheet({ visible, title, onClose, closeLabel = 'Close', aboveKeyboard = false, style, children }) {
  const backdrop = (
    <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={closeLabel}>
      {/* Taps inside the sheet must not close it. */}
      <Pressable style={[styles.sheet, style]} onPress={() => {}}>
        <View style={styles.handle} />
        <Text style={styles.title}>{title}</Text>
        {children}
      </Pressable>
    </Pressable>
  );
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {aboveKeyboard ? (
        <KeyboardAvoidingView behavior="padding" style={styles.flex}>
          {backdrop}
        </KeyboardAvoidingView>
      ) : (
        backdrop
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(17, 24, 39, 0.4)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.md * 2,
    borderTopRightRadius: radius.md * 2,
    padding: spacing.lg,
    gap: spacing.md,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border },
  title: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
});
