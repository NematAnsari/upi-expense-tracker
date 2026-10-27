// The setup cards on the Auto-Detect Settings screen. They only display state
// and call the handlers they are given; the screen does the checking.

import { StyleSheet, Switch, Text, View } from 'react-native';
import { colors, fontSize, spacing } from '../constants/theme';
import { Button } from './Button';
import { Card } from './Card';

function Status({ ok, okText, notOkText }) {
  return (
    <Text style={[styles.status, { color: ok ? colors.success : colors.danger }]}>● {ok ? okText : notOkText}</Text>
  );
}

/** Step 1: Notification access, which lets the app read bank SMS notifications. */
export function AccessCard({ granted, onOpenAccess, onOpenAppInfo }) {
  return (
    <Card title="1. Notification access">
      <Status ok={granted} okText="ON: payments are being detected" notOkText="OFF: payments are not being detected" />
      {granted ? null : (
        <View style={styles.steps}>
          <Text style={styles.step}>Tap “Turn on access”, find Expense Tracker and switch it on.</Text>
          <Button label="Turn on access" onPress={onOpenAccess} />
          <Text style={styles.step}>
            If Android says “Restricted setting”, tap OK. Then tap “Open app info”, open the ⋮ menu (top right), choose
            “Allow restricted settings”, and tap “Turn on access” again.
          </Text>
          <Button label="Open app info" variant="secondary" onPress={onOpenAppInfo} />
        </View>
      )}
      <Text style={styles.note}>
        Only notifications that look like payments (an amount plus words like debited, credited or paid) are kept. OTPs
        are never kept. Nothing leaves your phone.
      </Text>
    </Card>
  );
}

/** Step 2: Battery. Battery saving can stop detection while the app is closed. */
export function BatteryCard({ unrestricted, onOpenAppInfo }) {
  return (
    <Card title="2. Battery">
      <Status
        ok={unrestricted}
        okText="Unrestricted: detection keeps working in the background"
        notOkText="Restricted: detection may stop when the app is closed"
      />
      {unrestricted ? null : (
        <View style={styles.steps}>
          <Text style={styles.step}>Tap “Open app info”, then Battery, and choose “Unrestricted”.</Text>
          <Button label="Open app info" variant="secondary" onPress={onOpenAppInfo} />
        </View>
      )}
    </Card>
  );
}

/** Step 3: Payment alerts. The app's own "Payment detected" notification. */
export function RemindersCard({ supported, enabled, allowedByAndroid, onChange, onOpenAppInfo }) {
  if (!supported) {
    return (
      <Card title="3. Payment alerts">
        <Text style={styles.note}>Install the latest build of the app to get “Payment detected” alerts.</Text>
      </Card>
    );
  }
  const active = enabled && allowedByAndroid;
  return (
    <Card title="3. Payment alerts">
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Notify me when a payment is detected</Text>
        <Switch
          value={active}
          onValueChange={onChange}
          trackColor={{ true: colors.primary }}
          accessibilityLabel="Notify me when a payment is detected"
        />
      </View>
      {enabled && !allowedByAndroid ? (
        <View style={styles.steps}>
          <Text style={styles.step}>Android is blocking notifications from this app.</Text>
          <Button label="Allow notifications" variant="secondary" onPress={onOpenAppInfo} />
        </View>
      ) : (
        <Text style={styles.note}>
          {active
            ? 'You will see “Payment detected. Tap to review.” Tapping it opens Review Payments.'
            : 'Detected payments still wait in Review Payments; you just will not get an alert.'}
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  status: { fontSize: fontSize.md, fontWeight: '700' },
  steps: { gap: spacing.sm, marginTop: spacing.md },
  step: { fontSize: fontSize.md, color: colors.text },
  note: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.md },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  switchLabel: { flex: 1, fontSize: fontSize.md, color: colors.text },
});
