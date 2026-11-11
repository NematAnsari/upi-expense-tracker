// Backup & restore: save all your data to a file you keep off the phone
// (Google Drive, WhatsApp to yourself, email), and bring it back on this or a
// new phone. Restoring replaces what is on the phone, so it asks first.

import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ErrorState, LoadingState } from '../components/States';
import { colors, fontSize, spacing } from '../constants/theme';
import { checkBackup, countEntries, getLastBackupAt, restoreBackup } from '../db/backup';
import { useFocusQuery } from '../hooks/useFocusQuery';
import { clearSafetyCopy, pickBackup, readSafetyCopy, saveSafetyCopy, shareBackup } from '../services/backupFile';
import { showMessage } from '../ui/notify';
import { formatOrdinalDate, formatTime } from '../utils/dates';

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

export default function BackupScreen() {
  const db = useSQLiteContext();
  const [busy, setBusy] = useState(false);

  const loader = useCallback(
    async () => ({
      entries: await countEntries(db),
      lastBackupAt: await getLastBackupAt(db),
      // What was on the phone before the last restore, if a restore was done.
      safetyCopy: await readSafetyCopy(),
    }),
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

  // undo: bringing back the copy saved before the last restore (it is then used up).
  async function restore(backup, undo = false) {
    setBusy(true);
    try {
      if (!undo) {
        // Keep what is here now, so a restore from the wrong file can be undone.
        await saveSafetyCopy(db);
      }
      const summary = await restoreBackup(db, backup);
      if (undo) {
        clearSafetyCopy();
      }
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
        'Payments waiting for review are cleared too. A copy of what is here now is kept, so you can undo this restore from this screen.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Replace', style: 'destructive', onPress: () => restore(backup) },
      ],
    );
  }

  function handleUndoRestore() {
    const copy = data.safetyCopy;
    const checked = checkBackup(copy);
    if (checked.error) {
      Alert.alert('Cannot undo the restore', checked.error);
      return;
    }
    Alert.alert(
      'Undo the last restore?',
      `This brings back the ${plural(checked.summary.entries, 'entry', 'entries')} that were on this phone before the restore, and replaces what is here now.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Undo restore', style: 'destructive', onPress: () => restore(copy, true) },
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
          {`Saves all ${plural(data.entries, 'entry', 'entries')}, categories, bank accounts, shop accounts, templates and remembered names to one file. Keep it off the phone: Google Drive, WhatsApp to yourself, or email.`}
        </Text>
        <Text style={styles.muted}>
          {data.lastBackupAt
            ? `Last backup file made: ${formatOrdinalDate(data.lastBackupAt)}, ${formatTime(data.lastBackupAt)}. It only protects you if you saved it somewhere off the phone.`
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
        {data.safetyCopy ? (
          <View style={styles.undo}>
            <Text style={styles.muted}>
              {`A copy from before your last restore is kept on this phone (${plural(data.safetyCopy.tables?.transactions?.length ?? 0, 'entry', 'entries')}).`}
            </Text>
            <Button label="Undo last restore" variant="secondary" onPress={handleUndoRestore} disabled={busy} />
          </View>
        ) : null}
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
  undo: { marginTop: spacing.lg },
  muted: { fontSize: fontSize.sm, color: colors.textMuted, marginBottom: spacing.md },
});
