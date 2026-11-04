// Backup & restore: save all your data to a file you keep off the phone
// (Google Drive, WhatsApp to yourself, email), and bring it back on this or a
// new phone. Restoring replaces what is on the phone, so it asks first.

import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text } from 'react-native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ErrorState, LoadingState } from '../components/States';
import { colors, fontSize, spacing } from '../constants/theme';
import { checkBackup, countEntries, getLastBackupAt, restoreBackup } from '../db/backup';
import { useFocusQuery } from '../hooks/useFocusQuery';
import { pickBackup, shareBackup } from '../services/backupFile';
import { showMessage } from '../ui/notify';
import { formatOrdinalDate, formatTime } from '../utils/dates';

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

export default function BackupScreen() {
  const db = useSQLiteContext();
  const [busy, setBusy] = useState(false);

  const loader = useCallback(
    async () => ({ entries: await countEntries(db), lastBackupAt: await getLastBackupAt(db) }),
    [db],
  );
  const { data, error, reload } = useFocusQuery(loader);

  async function handleSave() {
    setBusy(true);
    try {
      const entries = await shareBackup(db);
      showMessage(`Backup ready: ${plural(entries, 'entry', 'entries')}`);
    } catch (saveError) {
      console.error(saveError);
      Alert.alert('Could not save the backup', saveError.message || 'Please try again.');
    } finally {
      setBusy(false);
      reload();
    }
  }

  async function restore(backup) {
    setBusy(true);
    try {
      const summary = await restoreBackup(db, backup);
      showMessage(`Restored ${plural(summary.entries, 'entry', 'entries')}`);
    } catch (restoreError) {
      console.error(restoreError);
      Alert.alert('Could not restore', `${restoreError.message || 'Please try again.'}\n\nNothing was changed.`);
    } finally {
      setBusy(false);
      reload();
    }
  }

  async function handleRestore() {
    let backup = null;
    try {
      backup = await pickBackup();
    } catch (pickError) {
      console.error(pickError);
      Alert.alert('Could not open the file', pickError.message || 'Please try again.');
      return;
    }
    if (!backup) {
      return;
    }
    const checked = checkBackup(backup);
    if (checked.error) {
      Alert.alert('Cannot restore this file', checked.error);
      return;
    }
    const from = checked.summary.createdAt ? ` saved on ${formatOrdinalDate(checked.summary.createdAt)}` : '';
    Alert.alert(
      'Replace all data?',
      `The backup${from} has ${plural(checked.summary.entries, 'entry', 'entries')}. ` +
        `This phone has ${plural(data.entries, 'entry', 'entries')} now, and they will be replaced. ` +
        'Payments waiting for review are cleared too. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Replace', style: 'destructive', onPress: () => restore(backup) },
      ],
    );
  }

  if (error) {
    return <ErrorState onRetry={reload} />;
  }
  if (!data) {
    return <LoadingState />;
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card title="Save a backup">
        <Text style={styles.text}>
          {`Saves all ${plural(data.entries, 'entry', 'entries')}, categories, bank accounts, templates and remembered names to one file. Keep it off the phone: Google Drive, WhatsApp to yourself, or email.`}
        </Text>
        <Text style={styles.muted}>
          {data.lastBackupAt
            ? `Last backup: ${formatOrdinalDate(data.lastBackupAt)}, ${formatTime(data.lastBackupAt)}`
            : 'No backup saved yet.'}
        </Text>
        <Button label="Save backup file" onPress={handleSave} loading={busy} />
      </Card>

      <Card title="Restore from a backup">
        <Text style={styles.text}>
          Choose a backup file to bring your data back, for example on a new phone. Everything on this phone is replaced
          by what is in the file.
        </Text>
        <Button label="Choose backup file" variant="secondary" onPress={handleRestore} disabled={busy} />
      </Card>

      <Text style={styles.muted}>
        The file is not locked with a password. Anyone who has it can read your entries, so keep it somewhere private.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg },
  text: { fontSize: fontSize.md, color: colors.text, marginBottom: spacing.md },
  muted: { fontSize: fontSize.sm, color: colors.textMuted, marginBottom: spacing.md },
});
