// Backup & restore: save all your data to a file you keep off the phone
// (Google Drive, WhatsApp to yourself, email), and bring it back on this or a
// new phone. Restoring replaces what is on the phone, so it asks first.
// Automatic backup writes a file every day into a folder you pick once.

import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/basics/Button';
import { Card } from '../components/basics/Card';
import { ErrorState, LoadingState } from '../components/basics/ScreenStates';
import { AutoBackupCard } from '../components/sections/AutoBackupCard';
import { colors, fontSize, spacing } from '../constants/theme';
import { checkBackup, countTransactions, getLastBackupAt, restoreBackup } from '../db/backup';
import { PHONE_KEYS, getAutoBackupSettings, setPhoneSetting } from '../db/phoneSettings';
import { useFocusQuery } from '../hooks/useFocusQuery';
import { pickBackupFolder, writeAutoBackup } from '../services/autoBackup';
import { syncAutoBackupTask } from '../services/autoBackupTask';
import { clearSafetyCopy, pickBackup, readSafetyCopy, saveSafetyCopy, shareBackup } from '../services/backupFile';
import { formatOrdinalDate, formatTime } from '../utils/dates';
import { showError, showMessage } from '../utils/notify';
import { plural } from '../utils/text';

const entriesText = (count) => plural(count, 'entry', 'entries');

export default function BackupScreen() {
  const db = useSQLiteContext();
  const [busy, setBusy] = useState(false);

  const loader = useCallback(async () => {
    const [entries, lastBackupAt, safetyCopy, autoBackup] = await Promise.all([
      countTransactions(db),
      getLastBackupAt(db),
      // What was on the phone before the last restore, if a restore was done.
      readSafetyCopy(),
      getAutoBackupSettings(db),
    ]);
    return { entries, lastBackupAt, safetyCopy, autoBackup };
  }, [db]);
  const { data, error, reload } = useFocusQuery(loader);

  async function handleSave() {
    setBusy(true);
    try {
      const entries = await shareBackup(db);
      showMessage(`Backup ready: ${entriesText(entries)}`);
    } catch (saveError) {
      showError('Could not save the backup', saveError);
    } finally {
      setBusy(false);
      reload();
    }
  }

  /** Runs one restore (`replaceData` resolves to its summary) and tells how it went. */
  async function runRestore(replaceData) {
    setBusy(true);
    try {
      const summary = await replaceData();
      showMessage(`Restored ${entriesText(summary.entries)}`);
    } catch (restoreError) {
      showError('Could not restore', restoreError, '\n\nNothing was changed.');
    } finally {
      setBusy(false);
      reload();
    }
  }

  function restoreFrom(backup) {
    return runRestore(async () => {
      // Keep what is here now, so a restore from the wrong file can be undone.
      await saveSafetyCopy(db);
      return restoreBackup(db, backup);
    });
  }

  function undoRestore() {
    return runRestore(async () => {
      const summary = await restoreBackup(db, data.safetyCopy);
      // The copy is used up once it is back.
      clearSafetyCopy();
      return summary;
    });
  }

  async function handleRestore() {
    let backup = null;
    try {
      backup = await pickBackup();
    } catch (pickError) {
      showError('Could not open the file', pickError);
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
      `The backup${from} has ${entriesText(checked.summary.entries)}. ` +
        `This phone has ${entriesText(data.entries)} now, and they will be replaced. ` +
        'Payments waiting for review are cleared too. A copy of what is here now is kept, so you can undo this restore from this screen.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Replace', style: 'destructive', onPress: () => restoreFrom(backup) },
      ],
    );
  }

  /** Saves today's file straight away, so you see at once that the folder works. */
  async function backUpNow(folder, doneMessage) {
    const result = await writeAutoBackup(db, folder);
    if (result.ok) {
      showMessage(doneMessage);
    } else {
      Alert.alert('Could not save to that folder', `${result.error}\n\nTry choosing the folder again.`);
    }
  }

  // Turning it on asks for a folder the first time.
  async function toggleAutoBackup(on) {
    setBusy(true);
    try {
      if (!on) {
        await setPhoneSetting(db, PHONE_KEYS.autoBackupOn, '');
        await syncAutoBackupTask(false);
        showMessage('Automatic backup is off');
        return;
      }
      let folder = data.autoBackup.folder;
      if (!folder) {
        folder = await pickBackupFolder();
        if (!folder) {
          return;
        }
        await setPhoneSetting(db, PHONE_KEYS.autoBackupFolder, folder);
      }
      await setPhoneSetting(db, PHONE_KEYS.autoBackupOn, '1');
      await syncAutoBackupTask(true);
      await backUpNow(folder, "Automatic backup is on. Today's file is saved.");
    } catch (toggleError) {
      showError('Could not change automatic backup', toggleError);
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
      await setPhoneSetting(db, PHONE_KEYS.autoBackupFolder, folder);
      if (data.autoBackup.on) {
        await backUpNow(folder, "Folder changed. Today's file is saved there.");
      } else {
        showMessage('Folder chosen');
      }
    } catch (folderError) {
      showError('Could not use that folder', folderError);
    } finally {
      setBusy(false);
      reload();
    }
  }

  function handleUndoRestore() {
    const checked = checkBackup(data.safetyCopy);
    if (checked.error) {
      Alert.alert('Cannot undo the restore', checked.error);
      return;
    }
    Alert.alert(
      'Undo the last restore?',
      `This brings back the ${entriesText(checked.summary.entries)} that were on this phone before the restore, and replaces what is here now.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Undo restore', style: 'destructive', onPress: undoRestore },
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
          {`Saves all ${entriesText(data.entries)}, categories, bank accounts, shop accounts, templates and remembered names to one file. Keep it off the phone: Google Drive, WhatsApp to yourself, or email.`}
        </Text>
        <Text style={styles.muted}>
          {data.lastBackupAt
            ? `Last backup file made: ${formatOrdinalDate(data.lastBackupAt)}, ${formatTime(data.lastBackupAt)}. It only protects you if you saved it somewhere off the phone.`
            : 'No backup saved yet.'}
        </Text>
        <Button label="Save backup file" onPress={handleSave} loading={busy} />
      </Card>

      <AutoBackupCard
        autoBackup={data.autoBackup}
        busy={busy}
        onToggle={toggleAutoBackup}
        onChangeFolder={changeFolder}
      />

      <Card title="Restore from a backup">
        <Text style={styles.text}>
          Choose a backup file to bring your data back, for example on a new phone. Everything on this phone is replaced
          by what is in the file.
        </Text>
        <Button label="Choose backup file" variant="secondary" onPress={handleRestore} disabled={busy} />
        {data.safetyCopy ? (
          <View style={styles.undo}>
            <Text style={styles.muted}>
              {`A copy from before your last restore is kept on this phone (${entriesText(data.safetyCopy.tables?.transactions?.length ?? 0)}).`}
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
