import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, spacing } from '../../constants/theme';
import { Button } from '../basics/Button';
import { TextField } from '../basics/TextField';

/**
 * A box to type a new name with Add and Cancel (a new category or bank account).
 * onAdd(name) saves it, or throws with a message to show; on success the
 * caller hides this box. style / errorStyle: spacing around the box and the error.
 */
export function AddNameBox({ placeholder, spokenLabel, maxLength, failText, onAdd, onCancel, style, errorStyle }) {
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function add() {
    if (saving) {
      return;
    }
    setSaving(true);
    try {
      await onAdd(name);
    } catch (addError) {
      setError(addError.message || failText);
      setSaving(false);
    }
  }

  return (
    <View style={style}>
      <View style={styles.row}>
        <TextField
          value={name}
          onChangeText={(text) => {
            setName(text);
            setError(null);
          }}
          placeholder={placeholder}
          maxLength={maxLength}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={add}
          error={error}
          style={styles.input}
          accessibilityLabel={spokenLabel}
        />
        <Button label="Add" onPress={add} loading={saving} />
        <Button label="Cancel" variant="secondary" onPress={onCancel} />
      </View>
      {error ? (
        <Text style={[styles.error, errorStyle]} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: { flex: 1 },
  error: { fontSize: fontSize.sm, color: colors.danger },
});
