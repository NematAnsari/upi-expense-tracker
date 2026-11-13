// Payment Detection: notification access, battery and payment alerts, plus
// every bank message the app captured and what happened to it.

import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, FlatList, PermissionsAndroid, StyleSheet, Text, View } from 'react-native';
import {
  areRemindersEnabled,
  canShowReminders,
  isAvailable,
  isBatteryUnrestricted,
  isPermissionGranted,
  openAppSettings,
  openPermissionSettings,
  setRemindersEnabled,
  supportsReminders,
} from '../../modules/upi-notification-listener';
import { AccessCard, BatteryCard, PaymentAlertsCard } from '../components/sections/DetectionSetupCards';
import { Button } from '../components/basics/Button';
import { CapturedMessageCard } from '../components/sections/CapturedMessageCard';
import { EmptyState } from '../components/basics/ScreenStates';
import { colors, fontSize, spacing } from '../constants/theme';
import { listRecentDetected, unignoreDetected } from '../db/detected';
import { syncDetectedPayments } from '../services/detection';
import { showError, showMessage } from '../utils/notify';

/** Reads every setting from Android at once. These checks are instant. */
function readSettings() {
  return {
    accessGranted: isPermissionGranted(),
    batteryUnrestricted: isBatteryUnrestricted(),
    remindersEnabled: areRemindersEnabled(),
    remindersAllowed: canShowReminders(),
  };
}

/** Android 13+ asks before an app may show notifications. Resolves true if allowed. */
async function requestNotificationPermission() {
  if (canShowReminders()) {
    return true;
  }
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

function Separator() {
  return <View style={styles.separator} />;
}

export default function PaymentDetectionScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [settings, setSettings] = useState(readSettings);
  const [messages, setMessages] = useState([]);

  const refresh = useCallback(async () => {
    setSettings(readSettings());
    try {
      await syncDetectedPayments(db);
      setMessages(await listRecentDetected(db));
    } catch (error) {
      showError('Could not load bank messages', error);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  // Coming back from Android Settings does not change screens, so also refresh
  // whenever the app returns to the foreground.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refresh();
      }
    });
    return () => subscription.remove();
  }, [refresh]);

  async function handleRemindersChange(turnOn) {
    if (turnOn) {
      const allowed = await requestNotificationPermission();
      if (!allowed) {
        Alert.alert(
          'Notifications are blocked',
          'To get payment alerts, allow notifications for Expense Tracker in app info.',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Open app info', onPress: openAppSettings },
          ],
        );
      }
    }
    setRemindersEnabled(turnOn);
    setSettings(readSettings());
  }

  async function handleRestore(message) {
    try {
      await unignoreDetected(db, message.id);
      showMessage('Moved back to Review Payments');
      refresh();
    } catch (error) {
      showError('Could not restore', error);
    }
  }

  if (!isAvailable) {
    return (
      <EmptyState
        title="Not available in Expo Go"
        message="Auto-detect needs the Expense Tracker app build. Open this screen there instead of in Expo Go."
      />
    );
  }

  const header = (
    <View style={styles.header}>
      <AccessCard
        granted={settings.accessGranted}
        onOpenAccess={openPermissionSettings}
        onOpenAppInfo={openAppSettings}
      />
      <BatteryCard unrestricted={settings.batteryUnrestricted} onOpenAppInfo={openAppSettings} />
      <PaymentAlertsCard
        supported={supportsReminders}
        enabled={settings.remindersEnabled}
        allowedByAndroid={settings.remindersAllowed}
        onChange={handleRemindersChange}
        onOpenAppInfo={openAppSettings}
      />

      <View style={styles.row}>
        <Button label="Review payments" onPress={() => router.push('/review-payments')} style={styles.flexButton} />
        <Button
          label="Bank accounts"
          variant="secondary"
          onPress={() => router.push('/bank-accounts')}
          style={styles.flexButton}
        />
      </View>

      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>Recent bank messages ({messages.length})</Text>
        <Button label="Refresh" variant="secondary" onPress={refresh} style={styles.smallButton} />
      </View>
    </View>
  );

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={messages}
      keyExtractor={(message) => String(message.id)}
      ListHeaderComponent={header}
      renderItem={({ item: message }) => <CapturedMessageCard item={message} onRestore={handleRestore} />}
      ItemSeparatorComponent={Separator}
      ListEmptyComponent={
        <EmptyState
          title="No bank messages yet"
          message={
            settings.accessGranted
              ? 'Make a small UPI payment or wait for a debit/credit SMS, then come back here.'
              : 'Turn on notification access first.'
          }
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  header: { gap: spacing.lg, marginBottom: spacing.md },
  row: { flexDirection: 'row', gap: spacing.sm },
  flexButton: { flex: 1 },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  listTitle: { fontSize: fontSize.lg, fontWeight: '600', color: colors.text },
  smallButton: { minHeight: 40 },
  separator: { height: spacing.md },
});
