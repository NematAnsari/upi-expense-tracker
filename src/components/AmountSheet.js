import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { parseAmountToPaise } from '../utils/money';
import { Button } from './Button';
import { SegmentedControl } from './SegmentedControl';

const METHODS = [
  { value: 'UPI', label: 'UPI' },
  { value: 'Cash', label: 'Cash' },
];

/**
 * A small bottom sheet to type one amount, for a shop account:
 *   Add tea · XYZ Tea                      (title)
 *   ₹ 40                                   (filled in, ready to change)
 *   [ UPI | Cash ]                         (only with withMethod, for paying)
 *   [ Cancel ]  [ Add ]
 * onSubmit(amountPaise, method) saves; it returns an error message to show
 * (and keeps the sheet open), or null. Open it with a new `key` each time so
 * it starts fresh.
 */
export function AmountSheet({
  visible,
  title,
  note,
  initialAmountText = '',
  withMethod = false,
  submitLabel,
  onSubmit,
  onClose,
}) {
  const [amountText, setAmountText] = useState(initialAmountText);
  const [method, setMethod] = useState('UPI');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    const amount = parseAmountToPaise(amountText);
    if (amount.error) {
      setError(amount.error);
      return;
    }
    setSaving(true);
    try {
      const message = await onSubmit(amount.paise, method);
      if (message) {
        setError(message);
        setSaving(false);
      }
    } catch (submitError) {
      console.error(submitError);
      setError(submitError.message || 'Could not save. Please try again.');
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Keeps the sheet above the keyboard. */}
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close">
          {/* Taps inside the sheet must not close it. */}
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.handle} />
            <Text style={styles.title}>{title}</Text>
            <View style={styles.amountRow}>
              <Text style={styles.rupee}>₹</Text>
              <TextInput
                value={amountText}
                onChangeText={(text) => {
                  setAmountText(text);
                  setError(null);
                }}
                placeholder="0"
                placeholderTextColor={colors.border}
                keyboardType="decimal-pad"
                autoFocus
                selectTextOnFocus
                style={styles.amount}
                accessibilityLabel="Amount in rupees"
              />
            </View>
            {error ? (
              <Text style={styles.error} accessibilityLiveRegion="polite">
                {error}
              </Text>
            ) : null}
            {withMethod ? <SegmentedControl options={METHODS} value={method} onChange={setMethod} /> : null}
            {note ? <Text style={styles.note}>{note}</Text> : null}
            <View style={styles.buttons}>
              <Button label="Cancel" variant="secondary" onPress={onClose} style={styles.flex} />
              <Button label={submitLabel} onPress={submit} loading={saving} style={styles.flex} />
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
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
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  rupee: { fontSize: fontSize.xxl, fontWeight: '600', color: colors.expense, marginRight: spacing.xs },
  amount: { fontSize: 40, fontWeight: '700', minWidth: 80, textAlign: 'center', color: colors.expense },
  error: { fontSize: fontSize.sm, color: colors.danger, textAlign: 'center' },
  note: { fontSize: fontSize.sm, color: colors.textMuted },
  buttons: { flexDirection: 'row', gap: spacing.md },
});
