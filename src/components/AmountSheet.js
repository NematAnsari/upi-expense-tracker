import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { formatShortDate, withDateFrom } from '../utils/dates';
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
 *   Date                          [ Today ] (only with withDate: an earlier day can be picked)
 *   [ Cancel ]  [ Add ]
 * onSubmit(amountPaise, method, occurredAt) saves; it returns an error message to show
 * (and keeps the sheet open), or null. Open it with a new `key` each time so
 * it starts fresh.
 */
export function AmountSheet({
  visible,
  title,
  note,
  initialAmountText = '',
  withMethod = false,
  withDate = false,
  submitLabel,
  onSubmit,
  onClose,
}) {
  const [amountText, setAmountText] = useState(initialAmountText);
  const [method, setMethod] = useState('UPI');
  // The day picked, or null for today (the time is always the moment you save).
  const [pickedDay, setPickedDay] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  function pickDay() {
    if (Platform.OS !== 'android') {
      return;
    }
    DateTimePickerAndroid.open({
      value: pickedDay ?? new Date(),
      mode: 'date',
      maximumDate: new Date(),
      onChange: (event, picked) => {
        if (event.type === 'set' && picked) {
          setPickedDay(picked);
        }
      },
    });
  }

  async function submit() {
    const amount = parseAmountToPaise(amountText);
    if (amount.error) {
      setError(amount.error);
      return;
    }
    setSaving(true);
    try {
      const now = new Date();
      const occurredAt = (pickedDay ? withDateFrom(now, pickedDay) : now).getTime();
      const message = await onSubmit(amount.paise, method, occurredAt);
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
            {withDate ? (
              <View style={styles.dateLine}>
                <Text style={styles.dateLabel}>Date</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Date: ${pickedDay ? formatShortDate(pickedDay.getTime()) : 'Today'}. Change date`}
                  onPress={pickDay}
                  hitSlop={6}
                  style={({ pressed }) => [styles.datePill, pressed && styles.pressed]}
                >
                  <Text style={styles.dateText}>{pickedDay ? formatShortDate(pickedDay.getTime()) : 'Today'}</Text>
                </Pressable>
              </View>
            ) : null}
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
  pressed: { opacity: 0.6 },
  dateLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateLabel: { fontSize: fontSize.md, color: colors.text },
  datePill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
  },
  dateText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  buttons: { flexDirection: 'row', gap: spacing.md },
});
