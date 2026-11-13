import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fontSize, spacing } from '../../constants/theme';
import { formatShortDate, withDateFrom } from '../../utils/dates';
import { parseAmountToPaise } from '../../utils/money';
import { BottomSheet } from '../basics/BottomSheet';
import { Button } from '../basics/Button';
import { SegmentedControl } from '../basics/SegmentedControl';
import { DatePill, openPicker } from './DatePill';

const PAY_METHODS = [
  { value: 'UPI', label: 'UPI' },
  { value: 'Cash', label: 'Cash' },
];

/**
 * A small bottom sheet to type one amount, for a shop account:
 *   Add at XYZ Tea                         (title)
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
  const dayText = pickedDay ? formatShortDate(pickedDay.getTime()) : 'Today';

  function pickDay() {
    openPicker({ value: pickedDay ?? new Date(), mode: 'date', maximumDate: new Date() }, setPickedDay);
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
    <BottomSheet visible={visible} title={title} onClose={onClose} aboveKeyboard>
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
      {withMethod ? <SegmentedControl options={PAY_METHODS} value={method} onChange={setMethod} /> : null}
      {withDate ? (
        <View style={styles.dateLine}>
          <Text style={styles.dateLabel}>Date</Text>
          <DatePill text={dayText} spokenLabel={`Date: ${dayText}. Change date`} onPress={pickDay} />
        </View>
      ) : null}
      {note ? <Text style={styles.note}>{note}</Text> : null}
      <View style={styles.buttons}>
        <Button label="Cancel" variant="secondary" onPress={onClose} style={styles.flex} />
        <Button label={submitLabel} onPress={submit} loading={saving} style={styles.flex} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  rupee: { fontSize: fontSize.xxl, fontWeight: '600', color: colors.expense, marginRight: spacing.xs },
  amount: { fontSize: 40, fontWeight: '700', minWidth: 80, textAlign: 'center', color: colors.expense },
  error: { fontSize: fontSize.sm, color: colors.danger, textAlign: 'center' },
  note: { fontSize: fontSize.sm, color: colors.textMuted },
  dateLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateLabel: { fontSize: fontSize.md, color: colors.text },
  buttons: { flexDirection: 'row', gap: spacing.md },
});
