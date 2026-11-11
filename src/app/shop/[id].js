// A shop account's statement, like its pages in your diary:
//   the due amount on top with + ₹40 and Pay, then one folding row per
//   month, newest first (the newest starts open):
//   ▾ November 2026                       ₹2,500.00 due
//       From Oct ₹1,000 · Taken 38 times ₹1,500 · Paid ₹0
//       4 Nov  XYZ Tea (3)                       −₹120.00 ▾
//   ▸ October 2026                        ₹1,000.00 due
// Swipe an entry right to edit or left to delete.
// "Edit account" changes the name, usual amount or the amount already due,
// and removes an account that has no entries.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Amount } from '../../components/Amount';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { RepeatGroupRow } from '../../components/RepeatGroupRow';
import { ShopAccountHero } from '../../components/ShopAccount';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { TextField } from '../../components/TextField';
import { TextLink } from '../../components/TextLink';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import {
  deleteShopAccount,
  getShopAccount,
  listShopAccounts,
  listShopEntries,
  updateShopAccount,
} from '../../db/shopAccounts';
import { groupRepeats } from '../../domain/repeats';
import { countText } from '../../domain/shopAccount';
import { useDeleteTransaction } from '../../hooks/useDeleteTransaction';
import { useFocusQuery } from '../../hooks/useFocusQuery';
import { formatMonthLabel, getMonthKey, shiftMonth } from '../../utils/dates';
import { showMessage } from '../../ui/notify';
import { formatINR, paiseToInputString, parseAmountToPaise } from '../../utils/money';

/** One number in a month's summary: a small label over the amount. */
function Figure({ label, paise, direction = 'debit' }) {
  return (
    <View style={styles.figure}>
      <Text style={styles.figureLabel} numberOfLines={1}>
        {label}
      </Text>
      <Amount paise={paise} direction={direction} size="sm" />
    </View>
  );
}

/** A month that folds open: its due amount in the header, its numbers and entries inside. */
function MonthSection({ month, entries, open, onToggle, onEdit, onDelete }) {
  const previous = formatMonthLabel(shiftMonth(month.monthKey, -1)).split(' ')[0].slice(0, 3);
  const rows = open ? groupRepeats(entries) : [];
  return (
    <View style={styles.month}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${formatMonthLabel(month.monthKey)}, ${formatINR(month.duePaise)} due at the end`}
        onPress={onToggle}
        style={({ pressed }) => [styles.monthHeader, pressed && styles.pressed]}
      >
        <Text style={styles.chevron}>{open ? '▾' : '▸'}</Text>
        <Text style={styles.monthName}>{formatMonthLabel(month.monthKey)}</Text>
        <Amount paise={month.duePaise} direction="debit" size="sm" />
        <Text style={styles.dueWord}>due</Text>
      </Pressable>
      {open ? (
        <View style={styles.monthBody}>
          <View style={styles.figures}>
            {month.carriedInPaise > 0 ? <Figure label={`From ${previous}`} paise={month.carriedInPaise} /> : null}
            <Figure label={`Taken · ${countText(month.count)}`} paise={month.purchasesPaise} />
            <Figure label="Paid" paise={month.paidPaise} direction="credit" />
          </View>
          {rows.length > 0 ? (
            rows.map((group) => (
              <View key={group.key} style={styles.divider}>
                <RepeatGroupRow group={group} onEdit={onEdit} onDelete={onDelete} />
              </View>
            ))
          ) : (
            <Text style={styles.empty}>Nothing taken or paid this month.</Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

export default function ShopStatementScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const accountId = Number(id);
  // Months you opened or closed (month key -> open); the newest starts open.
  const [opened, setOpened] = useState({});
  // The "Edit account" card: null while closed, else what is typed in it.
  const [editing, setEditing] = useState(null);
  const [editError, setEditError] = useState(null);
  const [saving, setSaving] = useState(false);

  const loader = useCallback(async () => {
    const [account, summaries, entries] = await Promise.all([
      getShopAccount(db, accountId),
      listShopAccounts(db),
      listShopEntries(db, accountId),
    ]);
    return { account, summary: summaries.find((item) => item.id === accountId) ?? null, entries };
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
  if (!data.account || !data.summary) {
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
    // Both amounts may be left empty; a typed one must be valid.
    const usual = editing.usualText.trim() ? parseAmountToPaise(editing.usualText) : { paise: null };
    const opening = editing.openingText.trim() ? parseAmountToPaise(editing.openingText) : { paise: 0 };
    if (usual.error || opening.error) {
      setEditError(usual.error ?? opening.error);
      return;
    }
    setSaving(true);
    try {
      await updateShopAccount(db, accountId, {
        name: editing.name,
        usualAmountPaise: usual.paise,
        openingDuePaise: opening.paise,
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
            Alert.alert('Could not remove', removeError.message || 'Please try again.');
          }
        },
      },
    ]);
  }

  // Newest month first, like turning back the diary's pages.
  const months = [...data.account.months].reverse();
  const newest = months[0]?.monthKey;
  const isOpen = (key) => opened[key] ?? key === newest;

  return (
    <KeyboardAwareScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      bottomOffset={spacing.xl}
    >
      <ShopAccountHero account={data.summary} onChanged={reload} />

      {editing ? (
        <Card title="Edit account">
          <View style={styles.form}>
            <Text style={styles.label}>Shop name</Text>
            <TextField
              value={editing.name}
              onChangeText={(text) => updateEdit('name', text)}
              maxLength={60}
              accessibilityLabel="Shop name"
            />
            <Text style={styles.label}>Usual amount</Text>
            <TextField
              value={editing.usualText}
              onChangeText={(text) => updateEdit('usualText', text)}
              placeholder="For example: 40"
              keyboardType="decimal-pad"
              accessibilityLabel="Usual amount in rupees"
            />
            <Text style={styles.label}>Already due when you started</Text>
            <TextField
              value={editing.openingText}
              onChangeText={(text) => updateEdit('openingText', text)}
              placeholder="0"
              keyboardType="decimal-pad"
              accessibilityLabel="Amount already due when you started, in rupees"
            />
            {editError ? (
              <Text style={styles.error} accessibilityLiveRegion="polite">
                {editError}
              </Text>
            ) : null}
            <View style={styles.buttons}>
              <Button label="Cancel" variant="secondary" onPress={() => setEditing(null)} style={styles.flex} />
              <Button label="Save" onPress={saveEdit} loading={saving} style={styles.flex} />
            </View>
            {/* Only an account with nothing in it can be removed. */}
            {data.entries.length === 0 ? (
              <Button label="Remove this account" variant="danger" onPress={removeAccount} disabled={saving} />
            ) : null}
          </View>
        </Card>
      ) : (
        <View style={styles.editLink}>
          <TextLink label="Edit account" onPress={startEdit} muted />
        </View>
      )}

      <View style={styles.months}>
        {months.map((month, index) => (
          <View key={month.monthKey} style={index > 0 && styles.divider}>
            <MonthSection
              month={month}
              entries={data.entries.filter((entry) => getMonthKey(new Date(entry.occurredAt)) === month.monthKey)}
              open={isOpen(month.monthKey)}
              onToggle={() => setOpened((current) => ({ ...current, [month.monthKey]: !isOpen(month.monthKey) }))}
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
  pressed: { opacity: 0.6 },
  flex: { flex: 1 },
  editLink: { alignItems: 'center' },
  form: { gap: spacing.sm },
  label: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text, marginTop: spacing.xs },
  error: { fontSize: fontSize.sm, color: colors.danger },
  buttons: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  // All months in one white card, divided by thin lines.
  months: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  month: { paddingVertical: spacing.xs },
  monthHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48 },
  chevron: { width: 14, fontSize: fontSize.sm, color: colors.textMuted },
  monthName: { flex: 1, fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  dueWord: { fontSize: fontSize.xs, color: colors.textMuted },
  monthBody: { paddingLeft: 14 + spacing.sm, paddingBottom: spacing.sm },
  figures: { flexDirection: 'row', gap: spacing.md, paddingBottom: spacing.sm },
  figure: { flex: 1, gap: 2 },
  figureLabel: { fontSize: fontSize.xs, color: colors.textMuted },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  empty: { fontSize: fontSize.sm, color: colors.textMuted, paddingVertical: spacing.sm },
  hint: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' },
});
