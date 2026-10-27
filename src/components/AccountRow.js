import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, spacing } from '../constants/theme';
import { Button } from './Button';
import { Card } from './Card';
import { TextField } from './TextField';

/** A bank account with an editable name. onSave(account, nickname) should save it. */
export function AccountRow({ account, onSave }) {
  const [nickname, setNickname] = useState(account.nickname);
  const [saving, setSaving] = useState(false);
  const changed = nickname.trim() !== account.nickname;

  async function save() {
    setSaving(true);
    try {
      await onSave(account, nickname);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card style={styles.card}>
      <Text style={styles.bank}>
        {account.bankName ?? 'Unknown bank'} · account ending {account.last4}
      </Text>
      <View style={styles.row}>
        <TextField
          value={nickname}
          onChangeText={setNickname}
          placeholder="e.g. Kotak Salary"
          maxLength={40}
          style={styles.input}
          accessibilityLabel={`Name for account ending ${account.last4}`}
        />
        <Button label="Save" onPress={save} disabled={!changed} loading={saving} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  bank: { fontSize: fontSize.sm, color: colors.textMuted },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  input: { flex: 1 },
});
