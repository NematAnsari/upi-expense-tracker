import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, spacing } from '../constants/theme';
import { formatDate, formatTime, withDateFrom, withTimeFrom } from '../utils/dates';
import { inputStyle } from './TextField';

/**
 * Date and time buttons that open Android's own pickers.
 * `value` and `onChange` use milliseconds. Future dates cannot be picked.
 */
export function DateTimeField({ value, onChange }) {
  function openPicker(mode) {
    if (Platform.OS !== 'android') {
      return;
    }
    DateTimePickerAndroid.open({
      value: new Date(value),
      mode,
      is24Hour: false,
      maximumDate: mode === 'date' ? new Date() : undefined,
      onChange: (event, picked) => {
        if (event.type !== 'set' || !picked) {
          return;
        }
        const base = new Date(value);
        const next = mode === 'date' ? withDateFrom(base, picked) : withTimeFrom(base, picked);
        onChange(next.getTime());
      },
    });
  }

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Date: ${formatDate(value)}. Change date`}
        onPress={() => openPicker('date')}
        style={styles.button}
      >
        <Text style={styles.text}>{formatDate(value)}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Time: ${formatTime(value)}. Change time`}
        onPress={() => openPicker('time')}
        style={styles.button}
      >
        <Text style={styles.text}>{formatTime(value)}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  button: { ...inputStyle, flex: 1, justifyContent: 'center' },
  text: { fontSize: fontSize.md, color: colors.text },
});
