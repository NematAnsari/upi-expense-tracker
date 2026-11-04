// Root layout: wraps every screen. It opens the SQLite database once, runs
// migrations, and only then renders the app, so screens can always query it.

import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { Suspense } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { DatabaseErrorBoundary } from '../components/DatabaseErrorBoundary';
import { LoadingState } from '../components/States';
import { colors } from '../constants/theme';
import { DATABASE_NAME, migrateDbIfNeeded } from '../db/migrations';

export default function RootLayout() {
  // GestureHandlerRootView lets swipe gestures (swipe a row to edit or delete) work on every screen.
  // KeyboardProvider lets screens keep the box you are typing in above the keyboard.
  return (
    <GestureHandlerRootView style={styles.root}>
      <KeyboardProvider>
        <DatabaseErrorBoundary>
          <Suspense fallback={<LoadingState message="Opening your expenses..." />}>
            <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrateDbIfNeeded} useSuspense>
              <StatusBar style="dark" />
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
              </Stack>
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
