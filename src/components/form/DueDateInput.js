import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, spacing } from '../../constants/theme';
import { formatOrdinalDate } from '../../utils/dates';
import { DatePill, openPicker } from './DatePill';

/**
 * "Return by" on the form, for money given or taken: a pill with the date (or
 * "Add date") that opens Android's date picker, and ✕ to clear it. Optional.
 * value / minimumMs / onChange use milliseconds (onChange(null) clears it).
 */
export function DueDateInput({ value, minimumMs, onChange }) {
  function pickDate() {
    const options = {
      value: new Date(Math.max(value ?? Date.now(), minimumMs)),
      mode: 'date',
      minimumDate: new Date(minimumMs),
    };
    openPicker(options, (picked) => {
      // End of the chosen day, so the whole day still counts as on time.
      const due = new Date(picked);
      due.setHours(23, 59, 0, 0);
      onChange(due.getTime());
    });
  }
  return (
    <View style={styles.due}>
      <DatePill
        text={value ? formatOrdinalDate(value) : 'Add date'}
        spokenLabel={value ? `Return by ${formatOrdinalDate(value)}. Change date` : 'Add a return by date'}
        onPress={pickDate}
        empty={!value}
      />
      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Remove the return by date"
          onPress={() => onChange(null)}
          hitSlop={8}
        >
          <Text style={styles.clear}>✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  due: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.sm },
  clear: { fontSize: fontSize.sm, color: colors.textMuted },
});
