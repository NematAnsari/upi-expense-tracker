// Root layout: wraps every screen. It opens the SQLite database once, runs
// migrations, and only then renders the app, so screens can always query it.

import { Stack } from 'expo-router';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { Suspense, useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { AppLockProvider } from '../components/AppLock';
import { DatabaseErrorBoundary } from '../components/DatabaseErrorBoundary';
import { LoadingState } from '../components/States';
import { colors } from '../constants/theme';
import { getAutoBackupSettings } from '../db/deviceSettings';
import { DATABASE_NAME, migrateDbIfNeeded } from '../db/migrations';
import { runAutoBackupIfDue } from '../services/autoBackup';
import { syncAutoBackupTask } from '../services/autoBackupTask';

/**
 * Once, when the app opens: makes sure the nightly backup is scheduled if it
 * is switched on, and catches up when last night's backup did not run
 * (Android may skip background work). Shows nothing.
 */
function AutoBackupOnOpen() {
  const db = useSQLiteContext();
  useEffect(() => {
    getAutoBackupSettings(db)
      .then((settings) => {
        syncAutoBackupTask(settings.on);
        return runAutoBackupIfDue(db);
      })
      .catch((error) => console.error(error));
  }, [db]);
  return null;
}

export default function RootLayout() {
  // GestureHandlerRootView lets swipe gestures (swipe a row to edit or delete) work on every screen.
  // KeyboardProvider lets screens keep the box you are typing in above the keyboard.
  // AppLockProvider covers everything with a lock screen when App lock is on.
  return (
    <GestureHandlerRootView style={styles.root}>
      <KeyboardProvider>
        <DatabaseErrorBoundary>
          <Suspense fallback={<LoadingState message="Opening your expenses..." />}>
            <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrateDbIfNeeded} useSuspense>
              <StatusBar style="dark" />
              <AutoBackupOnOpen />
              <AppLockProvider>
                <Stack
                  screenOptions={{
                    headerStyle: { backgroundColor: colors.surface },
                    headerTintColor: colors.text,
                    contentStyle: { backgroundColor: colors.background },
                  }}
                >
                  <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                  {/* The form sets its own title from what is selected ("Add Expense", "Edit Money Given"...). */}
                  <Stack.Screen name="transaction/new" options={{ title: 'Add Expense' }} />
                  <Stack.Screen name="transaction/[id]" options={{ title: 'Edit Expense' }} />
                  <Stack.Screen name="review-payments" options={{ title: 'Review Payments' }} />
                  <Stack.Screen name="auto-detect" options={{ title: 'Payment Detection' }} />
                  <Stack.Screen name="accounts" options={{ title: 'Bank Accounts' }} />
                  <Stack.Screen name="history" options={{ title: 'History' }} />
                  <Stack.Screen name="loan/[person]" options={{ title: 'Details' }} />
                  <Stack.Screen name="backup" options={{ title: 'Backup & Restore' }} />
                  <Stack.Screen name="shops" options={{ title: 'Shop Accounts' }} />
                  <Stack.Screen name="shop/[id]" options={{ title: 'Statement' }} />
                  <Stack.Screen name="app-lock" options={{ title: 'App Lock' }} />
                </Stack>
              </AppLockProvider>
            </SQLiteProvider>
          </Suspense>
        </DatabaseErrorBoundary>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
