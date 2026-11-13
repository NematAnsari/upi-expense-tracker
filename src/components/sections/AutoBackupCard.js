// The "Automatic backup" card on the Backup screen: the daily switch, the
// folder, and how the last automatic backup went.

import { StyleSheet, Switch, Text, View } from 'react-native';
import { Card } from '../basics/Card';
import { TextLink } from '../basics/TextLink';
import { colors, fontSize, spacing } from '../../constants/theme';
import { AUTO_BACKUPS_KEPT } from '../../domain/autoBackupSchedule';
import { folderName } from '../../services/autoBackup';
import { formatOrdinalDate, formatTime } from '../../utils/dates';

/** autoBackup: { on, folder, lastAt, error } from getAutoBackupSettings. */
export function AutoBackupCard({ autoBackup, busy, onToggle, onChangeFolder }) {
  return (
    <Card title="Automatic backup">
      <View style={styles.line}>
        <View style={styles.flex}>
          <Text style={styles.label}>Back up every day</Text>
          <Text style={styles.note}>
            Around midnight, when Android allows it (usually while the phone is idle or charging). If a night is missed,
            it runs the next time you open the app.
          </Text>
        </View>
        <Switch
          value={autoBackup.on}
          onValueChange={onToggle}
          disabled={busy}
          trackColor={{ true: colors.primary }}
          accessibilityLabel="Back up every day"
        />
      </View>
      <View style={[styles.line, styles.folderLine]}>
        <Text style={[styles.flex, styles.folder]} numberOfLines={1}>
          {autoBackup.folder ? `Folder: ${folderName(autoBackup.folder)}` : 'No folder chosen yet'}
        </Text>
        <TextLink
          label={autoBackup.folder ? 'Change folder' : 'Choose folder'}
          onPress={onChangeFolder}
          disabled={busy}
        />
      </View>
      <Text style={styles.note}>
        {autoBackup.lastAt
          ? `Last automatic backup: ${formatOrdinalDate(autoBackup.lastAt)}, ${formatTime(autoBackup.lastAt)}`
          : 'No automatic backup yet.'}
      </Text>
      {autoBackup.error ? <Text style={styles.error}>{`The last try failed: ${autoBackup.error}`}</Text> : null}
      <Text style={[styles.note, styles.gapTop]}>
        {`Keeps the newest ${AUTO_BACKUPS_KEPT} daily files in that folder; other files there are never touched. Pick a folder that Google Drive or another app keeps in sync, so a copy also lives off the phone.`}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  folderLine: { marginTop: spacing.md },
  label: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  folder: { fontSize: fontSize.md, color: colors.text },
  note: { fontSize: fontSize.sm, color: colors.textMuted },
  gapTop: { marginTop: spacing.sm },
  error: { fontSize: fontSize.sm, color: colors.danger, marginTop: spacing.xs },
});
