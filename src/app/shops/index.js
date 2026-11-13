// Shop accounts: shops where you take now and pay later, like the tea shop
// you keep a diary with. Each account shows what is due; tap one for its
// statement. "+ New shop account" starts one, with what is already due from
// your diary.

import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Amount } from '../../components/basics/Amount';
import { Button } from '../../components/basics/Button';
import { Card } from '../../components/basics/Card';
import { ListRow } from '../../components/basics/ListRow';
import { ErrorState, LoadingState } from '../../components/basics/ScreenStates';
import { ShopAccountForm } from '../../components/sections/ShopAccountForm';
import { colors, fontSize, spacing } from '../../constants/theme';
import { createCategory, listCategories } from '../../db/categories';
import { createShopAccount, listShopAccounts } from '../../db/shopAccounts';
import { pickableCategories } from '../../domain/transactionForm';
import { useFocusQuery } from '../../hooks/useFocusQuery';
import { showMessage } from '../../utils/notify';
import { parseOptionalAmount } from '../../utils/money';

const EMPTY_FORM = { name: '', categoryId: null, usualText: '', openingText: '' };

export default function ShopAccountsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const loader = useCallback(async () => {
    const [accounts, categories] = await Promise.all([listShopAccounts(db), listCategories(db)]);
    return { accounts, categories: pickableCategories(categories) };
  }, [db]);
  const { data, error, reload } = useFocusQuery(loader);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFormError(null);
  };

  function closeAdd() {
    setAdding(false);
    setForm(EMPTY_FORM);
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
    const usual = parseOptionalAmount(form.usualText);
    const opening = parseOptionalAmount(form.openingText);
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
      router.push({ pathname: '/shops/[id]', params: { id } });
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
                onPress={() => router.push({ pathname: '/shops/[id]', params: { id: account.id } })}
              />
            </View>
          ))}
        </Card>
      ) : null}

      {adding ? (
        <ShopAccountForm
          isNew
          values={form}
          onChange={updateField}
          categories={data.categories}
          onCreateCategory={handleCreateCategory}
          error={formError}
          saving={saving}
          onCancel={closeAdd}
          onSave={handleAdd}
        />
      ) : (
        <Button label="+ New shop account" variant="secondary" onPress={() => setAdding(true)} />
      )}
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl },
  note: { fontSize: fontSize.sm, color: colors.textMuted },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
