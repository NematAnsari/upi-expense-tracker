// App lock: one switch. When on, the app asks for the phone's own unlock
// (fingerprint, face, PIN, pattern or password) when it opens and after a
// minute away. There is no separate PIN to remember or forget.

import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useAppLock } from '../components/AppLock';
import { Card } from '../components/Card';
import { colors, fontSize, spacing } from '../constants/theme';
import { showMessage } from '../ui/notify';

export default function AppLockScreen() {
  const { enabled, setEnabled } = useAppLock();
  const [busy, setBusy] = useState(false);

  async function toggle(on) {
    setBusy(true);
    try {
      if (await setEnabled(on)) {
        showMessage(on ? 'App lock is on' : 'App lock is off');
      }
    } catch (error) {
      Alert.alert('Could not change App lock', error.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <View style={styles.line}>
          <View style={styles.flex}>
            <Text style={styles.label}>Lock the app</Text>
            <Text style={styles.note}>Asks when the app opens, and after you leave it for 1 minute.</Text>
          </View>
          <Switch
            value={enabled}
            onValueChange={toggle}
            disabled={busy}
            trackColor={{ true: colors.primary }}
            accessibilityLabel="Lock the app"
          />
        </View>
      </Card>
      <Text style={styles.note}>
        It uses the same fingerprint, face, PIN, pattern or password that unlocks your phone, so there is nothing new to
        remember. Anyone who can unlock your phone can also open the app.
      </Text>
      <Text style={styles.note}>
        The lock keeps other people out of the app on this phone. A backup file is separate: it has no password, so keep
        it somewhere private.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg },
  flex: { flex: 1 },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  label: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  note: { fontSize: fontSize.sm, color: colors.textMuted },
});
