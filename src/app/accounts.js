// Bank Accounts: give the accounts found in your bank SMS friendly names.

import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { AccountRow } from '../components/AccountRow';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { colors, fontSize, spacing } from '../constants/theme';
import { listAccounts, renameAccount } from '../db/accounts';
import { useFocusQuery } from '../hooks/useFocusQuery';
import { showMessage } from '../ui/notify';

export default function BankAccountsScreen() {
  const db = useSQLiteContext();
  const loader = useCallback(() => listAccounts(db), [db]);
  const { data: accounts, error, reload } = useFocusQuery(loader);

  async function handleSave(account, nickname) {
    try {
      await renameAccount(db, account.id, nickname);
      showMessage('Account renamed');
      reload();
    } catch (saveError) {
      Alert.alert('Could not rename', saveError.message || 'Please try again.');
    }
  }

  if (error) {
    return <ErrorState onRetry={reload} />;
  }
  if (!accounts) {
    return <LoadingState />;
  }
  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={accounts}
      keyExtractor={(account) => String(account.id)}
      ListHeaderComponent={
        <Text style={styles.note}>
          Accounts are added automatically from your bank SMS. Only the bank name and the last 4 digits are stored.
        </Text>
      }
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      renderItem={({ item }) => <AccountRow account={item} onSave={handleSave} />}
      ListEmptyComponent={
        <EmptyState title="No accounts yet" message="They appear after the first bank SMS is detected." />
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  note: { fontSize: fontSize.sm, color: colors.textMuted, marginBottom: spacing.md },
  separator: { height: spacing.md },
});
