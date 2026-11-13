// A shop account's statement, like its pages in your diary:
//   the due amount on top with + ₹40 and Pay, then one folding row per
//   month, newest first (the newest starts open):
//   ▾ November 2026                       ₹2,500.00 due
//       From Oct ₹1,000 · Taken 38 times ₹1,500 · Paid ₹0
//       4 Nov  XYZ Tea (3)                       −₹120.00 ▾
//   ▸ October 2026                        ₹1,000.00 due
// "Edit account" changes the name and amounts, and removes an account with no entries.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Button } from '../../components/basics/Button';
import { EmptyState, ErrorState, LoadingState } from '../../components/basics/ScreenStates';
import { TextLink } from '../../components/basics/TextLink';
import { ShopAccountForm } from '../../components/sections/ShopAccountForm';
import { ShopAccountHeader } from '../../components/sections/ShopAccountCards';
import { ShopMonthSection } from '../../components/sections/ShopMonthSection';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { deleteShopAccount, getShopAccount, listShopEntries, updateShopAccount } from '../../db/shopAccounts';
import { useDeleteTransaction } from '../../hooks/useDeleteTransaction';
import { useFocusQuery } from '../../hooks/useFocusQuery';
import { getMonthKey } from '../../utils/dates';
import { showError, showMessage } from '../../utils/notify';
import { paiseToInputString, parseOptionalAmount } from '../../utils/money';

const NO_ENTRIES = [];

/** Entries grouped by month key: { '2026-11': [...] }, keeping their order. */
function groupByMonth(entries) {
  const byMonth = {};
  for (const entry of entries) {
    const key = getMonthKey(new Date(entry.occurredAt));
    (byMonth[key] ??= []).push(entry);
  }
  return byMonth;
}

export default function ShopStatementScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const accountId = Number(id);
  // Months you opened or closed (month key -> open); the newest starts open.
  const [openMonths, setOpenMonths] = useState({});
  // The "Edit account" card: null while closed, else what is typed in it.
  const [editing, setEditing] = useState(null);
  const [editError, setEditError] = useState(null);
  const [saving, setSaving] = useState(false);

  const loader = useCallback(async () => {
    const [account, entries] = await Promise.all([getShopAccount(db, accountId), listShopEntries(db, accountId)]);
    return { account, entries, entriesByMonth: groupByMonth(entries) };
  }, [db, accountId]);
  const { data, error, reload } = useFocusQuery(loader);
  const deleteWithConfirm = useDeleteTransaction(reload);
  const openEntry = useCallback(
    (transaction) => router.push({ pathname: '/transaction/[id]', params: { id: transaction.id } }),
    [router],
  );

  if (error) {
    return <ErrorState onRetry={reload} />;
  }
  if (!data) {
    return <LoadingState />;
  }
  if (!data.account) {
    return (
      <EmptyState
        title="Shop account not found"
        message="It may have been removed."
        actionLabel="Go back"
        onAction={() => router.back()}
      />
    );
  }

  function startEdit() {
    const { name, usualAmountPaise, openingDuePaise } = data.account;
    setEditError(null);
    setEditing({
      name,
      usualText: usualAmountPaise ? paiseToInputString(usualAmountPaise) : '',
      openingText: openingDuePaise ? paiseToInputString(openingDuePaise) : '',
    });
  }

  const updateEdit = (field, value) => {
    setEditing((current) => ({ ...current, [field]: value }));
    setEditError(null);
  };

  async function saveEdit() {
    const usual = parseOptionalAmount(editing.usualText);
    const opening = parseOptionalAmount(editing.openingText);
    if (usual.error || opening.error) {
      setEditError(usual.error ?? opening.error);
      return;
    }
    setSaving(true);
    try {
      await updateShopAccount(db, accountId, {
        name: editing.name,
        usualAmountPaise: usual.paise,
        openingDuePaise: opening.paise ?? 0,
      });
      setEditing(null);
      showMessage('Account updated');
      reload();
    } catch (saveError) {
      setEditError(saveError.message || 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function removeAccount() {
    Alert.alert('Remove this shop account?', `${data.account.name} has no entries. This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteShopAccount(db, accountId);
            showMessage('Shop account removed');
            router.back();
          } catch (removeError) {
            showError('Could not remove', removeError);
          }
        },
      },
    ]);
  }

  const { account, entries, entriesByMonth } = data;
  // The header shows this month's numbers (the last month in the statement).
  const headerAccount = { ...account, month: account.months.at(-1) };
  // Newest month first, like turning back the diary's pages.
  const months = [...account.months].reverse();
  const newestMonthKey = months[0]?.monthKey;
  const isOpen = (key) => openMonths[key] ?? key === newestMonthKey;

  return (
    <KeyboardAwareScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      bottomOffset={spacing.xl}
    >
      <ShopAccountHeader account={headerAccount} onChanged={reload} />

      {editing ? (
        <ShopAccountForm
          values={editing}
          onChange={updateEdit}
          error={editError}
          saving={saving}
          onCancel={() => setEditing(null)}
          onSave={saveEdit}
        >
          {/* Only an account with nothing in it can be removed. */}
          {entries.length === 0 ? (
            <Button label="Remove this account" variant="danger" onPress={removeAccount} disabled={saving} />
          ) : null}
        </ShopAccountForm>
      ) : (
        <View style={styles.editLink}>
          <TextLink label="Edit account" onPress={startEdit} muted />
        </View>
      )}

      <View style={styles.months}>
        {months.map((month, index) => (
          <View key={month.monthKey} style={index > 0 && styles.divider}>
            <ShopMonthSection
              month={month}
              entries={entriesByMonth[month.monthKey] ?? NO_ENTRIES}
              open={isOpen(month.monthKey)}
              onToggle={() => setOpenMonths((current) => ({ ...current, [month.monthKey]: !isOpen(month.monthKey) }))}
              onEdit={openEntry}
              onDelete={deleteWithConfirm}
            />
          </View>
        ))}
      </View>
      <Text style={styles.hint}>Tip: swipe an entry right to edit it, or left to delete it.</Text>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl },
  editLink: { alignItems: 'center' },
  // All months in one white card, divided by thin lines.
  months: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  hint: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' },
});
