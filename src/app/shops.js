// Shop accounts: shops where you take now and pay later, like the tea shop
// you keep a diary with. Each account shows what is due; tap one for its
// statement. "+ New shop account" starts one, with what you already owe from
// your diary.

import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Amount } from '../components/Amount';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { CategoryIconRow } from '../components/CategoryIconRow';
import { ListRow } from '../components/ListRow';
import { ErrorState, LoadingState } from '../components/States';
import { TextField } from '../components/TextField';
import { colors, fontSize, spacing } from '../constants/theme';
import { createCategory, listCategories } from '../db/categories';
import { createShopAccount, listShopAccounts } from '../db/shopAccounts';
import { pickableCategories } from '../domain/transactionForm';
import { useFocusQuery } from '../hooks/useFocusQuery';
import { showMessage } from '../ui/notify';
import { formatINR, parseAmountToPaise } from '../utils/money';

const EMPTY = { name: '', categoryId: null, usualText: '', openingText: '' };

/** An optional amount box: empty is fine, otherwise it must be a valid amount. */
function optionalPaise(text) {
  if (!text.trim()) {
    return { paise: null };
  }
  return parseAmountToPaise(text);
}

export default function ShopAccountsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const loader = useCallback(async () => {
    const [accounts, categories] = await Promise.all([listShopAccounts(db), listCategories(db)]);
    return { accounts, categories: pickableCategories(categories) };
  }, [db]);
  const { data, error, reload } = useFocusQuery(loader);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const update = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFormError(null);
  };

  function closeAdd() {
    setAdding(false);
    setForm(EMPTY);
    setFormError(null);
  }

  async function handleCreateCategory(name) {
    const category = await createCategory(db, name);
    reload();
    return category;
  }

  async function handleAdd() {
    if (saving) {
      return;
    }
    const usual = optionalPaise(form.usualText);
    const opening = optionalPaise(form.openingText);
    if (!form.name.trim()) {
      setFormError('Enter the shop name.');
      return;
    }
    if (form.categoryId == null) {
      setFormError('Choose a category.');
      return;
    }
    if (usual.error || opening.error) {
      setFormError(usual.error ?? opening.error);
      return;
    }
    setSaving(true);
    try {
      const id = await createShopAccount(db, {
        name: form.name,
        categoryId: form.categoryId,
        usualAmountPaise: usual.paise,
        openingDuePaise: opening.paise ?? 0,
      });
      showMessage('Shop account added');
      closeAdd();
      router.push({ pathname: '/shop/[id]', params: { id } });
    } catch (createError) {
      setFormError(createError.message || 'Could not add the account.');
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return <ErrorState onRetry={reload} />;
  }
  if (!data) {
    return <LoadingState />;
  }

  return (
    <KeyboardAwareScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      bottomOffset={spacing.xl}
    >
      <Text style={styles.note}>
        For a shop where you take now and pay later, like tea every day paid at the end of the month. Each one counts as
        spending on its day; paying the shop only lowers what is due.
      </Text>

      {data.accounts.length > 0 ? (
        <Card>
          {data.accounts.map((account, index) => (
            <View key={account.id} style={index > 0 && styles.divider}>
              <ListRow
                title={account.name}
                subtitle={
                  account.duePaise > 0 ? (
                    <Text>
                      <Amount paise={account.duePaise} direction="debit" size="sm" />
                      {' due'}
                    </Text>
                  ) : (
                    'Nothing due'
                  )
                }
                onPress={() => router.push({ pathname: '/shop/[id]', params: { id: account.id } })}
              />
            </View>
          ))}
        </Card>
      ) : null}

      {adding ? (
        <Card title="New shop account">
          <View style={styles.form}>
            <Text style={styles.label}>Shop name *</Text>
            <TextField
              value={form.name}
              onChangeText={(text) => update('name', text)}
              placeholder="For example: XYZ Tea"
              maxLength={60}
              autoFocus
              accessibilityLabel="Shop name"
            />
            <Text style={styles.label}>Category *</Text>
            <CategoryIconRow
              categories={data.categories}
              selectedId={form.categoryId}
              onSelect={(id) => update('categoryId', id)}
              onCreate={handleCreateCategory}
            />
            <Text style={styles.label}>Usual amount</Text>
            <TextField
              value={form.usualText}
              onChangeText={(text) => update('usualText', text)}
              placeholder="For example: 40"
              keyboardType="decimal-pad"
              accessibilityLabel="Usual amount in rupees"
            />
            <Text style={styles.label}>Already due (from your diary)</Text>
            <TextField
              value={form.openingText}
              onChangeText={(text) => update('openingText', text)}
              placeholder="0"
              keyboardType="decimal-pad"
              accessibilityLabel="Amount already due in rupees"
            />
            <Text style={styles.hint}>
              {`What you owe the shop today, before using the app. It is not counted as spending${
                form.openingText.trim() && !parseAmountToPaise(form.openingText).error
                  ? ` (${formatINR(parseAmountToPaise(form.openingText).paise)} carried over)`
                  : ''
              }.`}
            </Text>
            {formError ? (
              <Text style={styles.error} accessibilityLiveRegion="polite">
                {formError}
              </Text>
            ) : null}
            <View style={styles.buttons}>
              <Button label="Cancel" variant="secondary" onPress={closeAdd} style={styles.flex} />
              <Button label="Add" onPress={handleAdd} loading={saving} style={styles.flex} />
            </View>
          </View>
        </Card>
      ) : (
        <Button label="+ New shop account" variant="secondary" onPress={() => setAdding(true)} />
      )}
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl },
  flex: { flex: 1 },
  note: { fontSize: fontSize.sm, color: colors.textMuted },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  form: { gap: spacing.sm },
  label: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text, marginTop: spacing.xs },
  hint: { fontSize: fontSize.sm, color: colors.textMuted },
  error: { fontSize: fontSize.sm, color: colors.danger },
  buttons: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
});
