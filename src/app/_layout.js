// Root layout: wraps every screen. It opens the SQLite database once, runs
// migrations, and only then renders the app, so screens can always query it.

import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { Suspense, useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { AppLockProvider } from '../components/wrappers/AppLockProvider';
import { DatabaseErrorBoundary } from '../components/wrappers/DatabaseErrorBoundary';
import { LoadingState } from '../components/basics/ScreenStates';
import { colors } from '../constants/theme';
import { getAutoBackupSettings } from '../db/phoneSettings';
import { DATABASE_NAME, migrateDbIfNeeded } from '../db/migrations';
import { runAutoBackupIfDue } from '../services/autoBackup';
import { syncAutoBackupTask } from '../services/autoBackupTask';

// Keep the splash up until the database is open, so there is no blank flash. It fades out by itself.
SplashScreen.preventAutoHideAsync();

/** Hides the splash once it is drawn, which is after the database opened. */
function HideSplash() {
  useEffect(() => {
    SplashScreen.hide();
  }, []);
  return null;
}

/** When the app opens: schedules the nightly backup if it is on, and catches up a missed one (Android may skip it). */
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
              <HideSplash />
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
                  <Stack.Screen name="payment-detection" options={{ title: 'Payment Detection' }} />
                  <Stack.Screen name="bank-accounts" options={{ title: 'Bank Accounts' }} />
                  <Stack.Screen name="history" options={{ title: 'History' }} />
                  <Stack.Screen name="person/[name]" options={{ title: 'Details' }} />
                  <Stack.Screen name="backup" options={{ title: 'Backup & Restore' }} />
                  <Stack.Screen name="shops/index" options={{ title: 'Shop Accounts' }} />
                  <Stack.Screen name="shops/[id]" options={{ title: 'Statement' }} />
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
