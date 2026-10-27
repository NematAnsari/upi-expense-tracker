import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PAYMENT_METHODS } from '../constants/categories';
import { amountColor, colors, fontSize, spacing } from '../constants/theme';
import { createCategory } from '../db/categories';
import { suggestMerchants, suggestPurposes } from '../db/suggestions';
import { deleteTemplate, markTemplateUsed, saveTemplate } from '../db/templates';
import { applyTemplate, buildTemplateName } from '../domain/transactionForm';
import { validateTemplateForm, validateTransactionForm } from '../domain/validation';
import { useAsyncValue } from '../hooks/useAsyncValue';
import { showMessage } from '../ui/notify';
import { Button } from './Button';
import { CategoryPicker } from './CategoryPicker';
import { Chip } from './Chip';
import { DateTimeField } from './DateTimeField';
import { DirectionToggle } from './DirectionToggle';
import { SuggestionChips } from './SuggestionChips';
import { TemplateBar, templateLabel } from './TemplateBar';
import { FormField, TextField } from './TextField';

// Which error message belongs to which form field.
const ERROR_KEY_FOR_FIELD = { amountText: 'amount', categoryId: 'category' };

/**
 * The add/edit form for a transaction (money paid or received).
 *
 * onSubmit(values) should save and navigate away. If it throws, the error is
 * shown and everything typed stays in the form.
 * templates: pass an array (even empty) to show templates. Add does; Edit does not.
 * accounts: bank accounts to choose from. The row is hidden when there are none.
 */
export function TransactionForm({
  categories,
  templates,
  accounts = [],
  initialValues,
  submitLabel,
  onSubmit,
  onDelete,
}) {
  const db = useSQLiteContext();
  const [form, setForm] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [categoryList, setCategoryList] = useState(categories);
  const [templateList, setTemplateList] = useState(templates ?? []);
  const [showMoreDetails, setShowMoreDetails] = useState(Boolean(initialValues.reference || initialValues.notes));
  // A ref updates instantly, unlike state, so a fast double tap cannot save twice.
  const savingRef = useRef(false);
  const templatesEnabled = templates != null;
  const received = form.direction === 'credit';

  const loadMerchantSuggestions = useCallback(() => suggestMerchants(db, form.merchant), [db, form.merchant]);
  const loadPurposeSuggestions = useCallback(
    () => suggestPurposes(db, form.purpose, form.categoryId),
    [db, form.purpose, form.categoryId],
  );
  const merchantSuggestions = useAsyncValue(loadMerchantSuggestions, []);
  const purposeSuggestions = useAsyncValue(loadPurposeSuggestions, []);

  function updateFields(changes) {
    setForm((current) => ({ ...current, ...changes }));
    setErrors((current) => {
      const next = { ...current };
      for (const field of Object.keys(changes)) {
        delete next[ERROR_KEY_FOR_FIELD[field] ?? field];
      }
      return next;
    });
  }

  const update = (field, value) => updateFields({ [field]: value });

  // Picking a remembered merchant or purpose also fills an empty category.
  function pickSuggestion(field, suggestion) {
    const changes = { [field]: suggestion.value };
    const knownCategory = categoryList.some((category) => category.id === suggestion.categoryId);
    if (form.categoryId == null && knownCategory) {
      changes.categoryId = suggestion.categoryId;
    }
    updateFields(changes);
  }

  async function handleCreateCategory(name) {
    const category = await createCategory(db, name);
    setCategoryList((current) => [...current, category]);
    return category;
  }

  function handleApplyTemplate(template) {
    setForm((current) => applyTemplate(current, template));
    setErrors({});
    markTemplateUsed(db, template.id).catch((error) => console.error(error));
  }

  function handleDeleteTemplate(template) {
    Alert.alert(
      'Delete template?',
      `"${templateLabel(template)}" will be removed. Your saved transactions are not affected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteTemplate(db, template.id);
              setTemplateList((current) => current.filter((item) => item.id !== template.id));
            } catch (error) {
              console.error(error);
              Alert.alert('Could not delete template', error.message || 'Please try again.');
            }
          },
        },
      ],
    );
  }

  async function handleSaveTemplate() {
    const result = validateTemplateForm(form);
    if (!result.template) {
      setErrors((current) => ({ ...current, ...result.errors }));
      return;
    }
    const categoryName = categoryList.find((category) => category.id === result.template.categoryId)?.name ?? '';
    const name = buildTemplateName(result.template, categoryName);
    try {
      const saved = await saveTemplate(db, { ...result.template, name });
      setTemplateList((current) => [...current.filter((item) => item.id !== saved.id), saved]);
      showMessage(`Template "${saved.name}" saved`);
    } catch (error) {
      console.error(error);
      Alert.alert('Could not save template', error.message || 'Please try again.');
    }
  }

  async function handleSubmit() {
    if (savingRef.current) {
      return;
    }
    const result = validateTransactionForm(form);
    setErrors(result.errors);
    if (!result.values) {
      return;
    }

    savingRef.current = true;
    setSaving(true);
    try {
      await onSubmit(result.values);
      // On success the screen navigates away, so the button stays disabled.
    } catch (error) {
      console.error(error);
      savingRef.current = false;
      setSaving(false);
      Alert.alert(
        'Could not save',
        `${error.message || 'Unknown error.'}\n\nYour entries are still in the form. Please try again.`,
      );
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {templatesEnabled ? (
        <TemplateBar templates={templateList} onApply={handleApplyTemplate} onLongPress={handleDeleteTemplate} />
      ) : null}

      <FormField label="Type" error={errors.direction}>
        <DirectionToggle value={form.direction} onChange={(value) => update('direction', value)} />
      </FormField>

      <FormField label="Amount (₹)" required error={errors.amount}>
        <TextField
          value={form.amountText}
          onChangeText={(text) => update('amountText', text)}
          placeholder="0.00"
          keyboardType="decimal-pad"
          error={errors.amount}
          style={[styles.amountInput, { color: amountColor(form.direction) }]}
          accessibilityLabel={received ? 'Amount received in rupees' : 'Amount paid in rupees'}
          autoFocus={!form.amountText}
        />
      </FormField>

      <FormField label="Category" required error={errors.category}>
        <CategoryPicker
          categories={categoryList}
          selectedId={form.categoryId}
          onSelect={(id) => update('categoryId', id)}
          onCreate={handleCreateCategory}
        />
      </FormField>

      <FormField label="Purpose">
        <TextField
          value={form.purpose}
          onChangeText={(text) => update('purpose', text)}
          placeholder={received ? 'What was this money for?' : 'What did you pay for?'}
          maxLength={120}
        />
        <SuggestionChips
          label="Use purpose"
          suggestions={purposeSuggestions}
          onPick={(suggestion) => pickSuggestion('purpose', suggestion)}
        />
      </FormField>

      <FormField label={received ? 'Received from' : 'Paid to'}>
        <TextField
          value={form.merchant}
          onChangeText={(text) => update('merchant', text)}
          placeholder="Shop or person's name"
          maxLength={80}
        />
        <SuggestionChips
          label="Use name"
          suggestions={merchantSuggestions}
          onPick={(suggestion) => pickSuggestion('merchant', suggestion)}
        />
      </FormField>

      <FormField label="Payment method" required error={errors.paymentMethod}>
        <View style={styles.chips}>
          {PAYMENT_METHODS.map((method) => (
            <Chip
              key={method}
              label={method}
              selected={form.paymentMethod === method}
              onPress={() => update('paymentMethod', method)}
            />
          ))}
        </View>
      </FormField>

      {accounts.length > 0 ? (
        <FormField label="Bank account">
          <View style={styles.chips}>
            <Chip label="None" selected={form.accountId == null} onPress={() => update('accountId', null)} />
            {accounts.map((account) => (
              <Chip
                key={account.id}
                label={account.nickname}
                selected={form.accountId === account.id}
                onPress={() => update('accountId', account.id)}
              />
            ))}
          </View>
        </FormField>
      ) : null}

      <FormField label="Date and time" error={errors.occurredAt}>
        <DateTimeField value={form.occurredAt} onChange={(value) => update('occurredAt', value)} />
      </FormField>

      {showMoreDetails ? (
        <>
          <FormField label="UPI reference number">
            <TextField
              value={form.reference}
              onChangeText={(text) => update('reference', text)}
              placeholder="From your bank SMS or UPI app (optional)"
              autoCapitalize="none"
              maxLength={60}
            />
          </FormField>

          <FormField label="Notes">
            <TextField
              value={form.notes}
              onChangeText={(text) => update('notes', text)}
              placeholder="Anything else to remember (optional)"
              multiline
              maxLength={500}
              style={styles.notes}
            />
          </FormField>
        </>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => setShowMoreDetails(true)}
          hitSlop={8}
          style={styles.moreDetails}
        >
          <Text style={styles.link}>+ Add reference number or notes</Text>
        </Pressable>
      )}

      <Button label={submitLabel} onPress={handleSubmit} loading={saving} />
      {templatesEnabled ? (
        <Button label="Save as template" variant="secondary" onPress={handleSaveTemplate} disabled={saving} />
      ) : null}
      {onDelete ? <Button label="Delete transaction" variant="danger" onPress={onDelete} disabled={saving} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 160 },
  amountInput: { fontSize: fontSize.xl, fontWeight: '700' },
  notes: { minHeight: 88, paddingTop: spacing.md, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  moreDetails: { minHeight: 44, justifyContent: 'center' },
  link: { fontSize: fontSize.md, color: colors.primary, fontWeight: '600' },
});
