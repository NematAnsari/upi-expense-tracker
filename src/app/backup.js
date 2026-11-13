// Backup & restore: save all your data to a file you keep off the phone
// (Google Drive, WhatsApp to yourself, email), and bring it back on this or a
// new phone. Restoring replaces what is on the phone, so it asks first.
// Automatic backup writes a file every day into a folder you pick once.

import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ErrorState, LoadingState } from '../components/States';
import { TextLink } from '../components/TextLink';
import { colors, fontSize, spacing } from '../constants/theme';
import { checkBackup, countEntries, getLastBackupAt, restoreBackup } from '../db/backup';
import { DEVICE_KEYS, getAutoBackupSettings, setDeviceSetting } from '../db/deviceSettings';
import { AUTO_BACKUPS_KEPT } from '../domain/autoBackup';
import { useFocusQuery } from '../hooks/useFocusQuery';
import { folderLabel, pickBackupFolder, runAutoBackup } from '../services/autoBackup';
import { syncAutoBackupTask } from '../services/autoBackupTask';
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
      auto: await getAutoBackupSettings(db),
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

  /** Saves today's file straight away, so you see at once that the folder works. */
  async function backUpNow(folder, doneMessage) {
    const result = await runAutoBackup(db, folder);
    if (result.ok) {
      showMessage(doneMessage);
    } else {
      Alert.alert(
        'Could not save to that folder',
        `${result.error}

Try choosing the folder again.`,
      );
    }
  }

  // Turning it on asks for a folder the first time.
  async function toggleAutoBackup(on) {
    setBusy(true);
    try {
      if (!on) {
        await setDeviceSetting(db, DEVICE_KEYS.autoBackupOn, '');
        await syncAutoBackupTask(false);
        showMessage('Automatic backup is off');
        return;
      }
      let folder = data.auto.folder;
      if (!folder) {
        folder = await pickBackupFolder();
        if (!folder) {
          return;
        }
        await setDeviceSetting(db, DEVICE_KEYS.autoBackupFolder, folder);
      }
      await setDeviceSetting(db, DEVICE_KEYS.autoBackupOn, '1');
      await syncAutoBackupTask(true);
      await backUpNow(folder, "Automatic backup is on. Today's file is saved.");
    } catch (toggleError) {
      console.error(toggleError);
      Alert.alert('Could not change automatic backup', toggleError.message || 'Please try again.');
    } finally {
      setBusy(false);
      reload();
    }
  }

  async function changeFolder() {
    setBusy(true);
    try {
      const folder = await pickBackupFolder();
      if (!folder) {
        return;
      }
      await setDeviceSetting(db, DEVICE_KEYS.autoBackupFolder, folder);
      if (data.auto.on) {
        await backUpNow(folder, "Folder changed. Today's file is saved there.");
      } else {
        showMessage('Folder chosen');
      }
    } catch (folderError) {
      console.error(folderError);
      Alert.alert('Could not use that folder', folderError.message || 'Please try again.');
    } finally {
      setBusy(false);
      reload();
    }
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

      <Card title="Automatic backup">
        <View style={styles.line}>
          <View style={styles.flex}>
            <Text style={styles.label}>Back up every day</Text>
            <Text style={styles.note}>
              Around midnight, when Android allows it (usually while the phone is idle or charging). If a night is
              missed, it runs the next time you open the app.
            </Text>
          </View>
          <Switch
            value={data.auto.on}
            onValueChange={toggleAutoBackup}
            disabled={busy}
            trackColor={{ true: colors.primary }}
            accessibilityLabel="Back up every day"
          />
        </View>
        <View style={[styles.line, styles.folderLine]}>
          <Text style={[styles.flex, styles.folder]} numberOfLines={1}>
            {data.auto.folder ? `Folder: ${folderLabel(data.auto.folder)}` : 'No folder chosen yet'}
          </Text>
          <TextLink
            label={data.auto.folder ? 'Change folder' : 'Choose folder'}
            onPress={changeFolder}
            disabled={busy}
          />
        </View>
        <Text style={styles.note}>
          {data.auto.lastAt
            ? `Last automatic backup: ${formatOrdinalDate(data.auto.lastAt)}, ${formatTime(data.auto.lastAt)}`
            : 'No automatic backup yet.'}
        </Text>
        {data.auto.error ? <Text style={styles.error}>{`The last try failed: ${data.auto.error}`}</Text> : null}
        <Text style={[styles.note, styles.gapTop]}>
          {`Keeps the newest ${AUTO_BACKUPS_KEPT} daily files in that folder; other files there are never touched. Pick a folder that Google Drive or another app keeps in sync, so a copy also lives off the phone.`}
        </Text>
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
  flex: { flex: 1 },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  folderLine: { marginTop: spacing.md },
  label: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  folder: { fontSize: fontSize.md, color: colors.text },
  note: { fontSize: fontSize.sm, color: colors.textMuted },
  gapTop: { marginTop: spacing.sm },
  error: { fontSize: fontSize.sm, color: colors.danger, marginTop: spacing.xs },
});
