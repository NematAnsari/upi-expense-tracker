// Bank Accounts: the accounts found in your bank SMS, plus any you add by hand.
// Tap one to give it a friendly name; "+ Add account" adds a new one.

import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { AccountRow } from '../components/AccountRow';
import { Button } from '../components/Button';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { TextField } from '../components/TextField';
import { colors, fontSize, spacing } from '../constants/theme';
import { createAccount, listAccounts, renameAccount } from '../db/accounts';
import { useFocusQuery } from '../hooks/useFocusQuery';
import { showMessage } from '../ui/notify';

export default function BankAccountsScreen() {
  const db = useSQLiteContext();
  const loader = useCallback(() => listAccounts(db), [db]);
  const { data: accounts, error, reload } = useFocusQuery(loader);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [addError, setAddError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function handleSave(account, nickname) {
    try {
      await renameAccount(db, account.id, nickname);
      showMessage('Account renamed');
      reload();
    } catch (saveError) {
      Alert.alert('Could not rename', saveError.message || 'Please try again.');
    }
  }

  function closeAdd() {
    setAdding(false);
    setNewName('');
    setAddError(null);
  }

  async function handleAdd() {
    if (saving) {
      return;
    }
    setSaving(true);
    try {
      await createAccount(db, newName);
      showMessage('Account added');
      closeAdd();
      reload();
    } catch (createError) {
      setAddError(createError.message || 'Could not add the account.');
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return <ErrorState onRetry={reload} />;
  }
  if (!accounts) {
    return <LoadingState />;
  }

  // A plain element (not a component made here), so the text box keeps focus while typing.
  const header = (
    <View style={styles.header}>
      <Text style={styles.note}>
        Accounts from your bank SMS are added automatically; only the bank name and the last 4 digits are stored. You
        can also add one yourself.
      </Text>
      {adding ? (
        <View style={styles.addBlock}>
          <TextField
            value={newName}
            onChangeText={(text) => {
              setNewName(text);
              setAddError(null);
            }}
            placeholder="Account name, e.g. SBI Salary"
            maxLength={40}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleAdd}
            error={addError}
            accessibilityLabel="New account name"
          />
          {addError ? <Text style={styles.error}>{addError}</Text> : null}
          <View style={styles.addButtons}>
            <Button label="Cancel" variant="secondary" onPress={closeAdd} style={styles.flex} />
            <Button label="Add" onPress={handleAdd} loading={saving} style={styles.flex} />
          </View>
        </View>
      ) : (
        <Button label="+ Add account" variant="secondary" onPress={() => setAdding(true)} />
      )}
    </View>
  );

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={accounts}
      keyExtractor={(account) => String(account.id)}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={header}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      renderItem={({ item }) => <AccountRow account={item} onSave={handleSave} />}
      ListEmptyComponent={
        <EmptyState
          title="No accounts yet"
          message="They appear after the first bank SMS is detected, or add one above."
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  flex: { flex: 1 },
  header: { gap: spacing.md, marginBottom: spacing.md },
  note: { fontSize: fontSize.sm, color: colors.textMuted },
  addBlock: { gap: spacing.sm },
  addButtons: { flexDirection: 'row', gap: spacing.md },
  error: { fontSize: fontSize.sm, color: colors.danger },
  separator: { height: spacing.md },
});
