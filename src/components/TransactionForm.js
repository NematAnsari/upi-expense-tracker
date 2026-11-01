import { useSQLiteContext } from 'expo-sqlite';
import { Children, useCallback, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { PAYMENT_METHODS } from '../constants/categories';
import { amountColor, colors, fontSize, spacing } from '../constants/theme';
import { createCategory } from '../db/categories';
import { suggestMerchants, suggestPurposes } from '../db/suggestions';
import { deleteTemplate, markTemplateUsed, saveTemplate } from '../db/templates';
import { INCOME } from '../domain/categorize';
import { findSimilarPeople, LOAN_TYPES } from '../domain/loans';
import {
  ACTIVITIES,
  activityFor,
  applyTemplate,
  buildTemplateName,
  categoryIdForSave,
  pickableCategories,
} from '../domain/transactionForm';
import { validateTemplateForm, validateTransactionForm } from '../domain/validation';
import { useAsyncValue } from '../hooks/useAsyncValue';
import { showMessage } from '../ui/notify';
import { formatDate, formatTime } from '../utils/dates';
import { Button } from './Button';
import { Card } from './Card';
import { CategoryIconRow } from './CategoryIconRow';
import { Chip } from './Chip';
import { DateTimeField } from './DateTimeField';
import { SegmentedControl } from './SegmentedControl';
import { SuggestionChips } from './SuggestionChips';
import { TemplateBar, templateLabel } from './TemplateBar';
import { TextLink } from './TextLink';
import { FormField, TextField } from './TextField';

// Which error message belongs to which form field.
const ERROR_KEY_FOR_FIELD = { amountText: 'amount', categoryId: 'category' };

// The two choices the form offers, decided by where it was opened (see pairFor).
const PAIRS = {
  expenses: [
    { value: 'paid', label: 'Paid' },
    { value: 'received', label: 'Received' },
  ],
  people: [
    { value: 'gave', label: 'I gave' },
    { value: 'took', label: 'I took' },
  ],
};

/**
 * Which pair of choices fits the entry the form starts with: an expense or
 * income gets Paid | Received, money given or taken gets I gave | I took, and
 * money received back or returned gets no choice (its type is shown as text).
 * So the Expenses tab, the Given & Taken tab, editing and Review details each
 * show only what belongs there.
 */
function pairFor(loanType) {
  if (loanType == null) {
    return PAIRS.expenses;
  }
  return loanType === 'lent' || loanType === 'borrowed' ? PAIRS.people : null;
}

/**
 * A labelled line inside the Details card: label on the left, the first child
 * (the input) on the right, any other children (suggestions) underneath.
 */
function DetailLine({ label, required, children, error, last }) {
  const [input, ...below] = Children.toArray(children);
  return (
    <View style={[styles.detail, !last && styles.detailBorder]}>
      <View style={styles.detailLine}>
        <Text style={styles.detailLabel}>
          {label}
          {required ? <Text style={styles.required}> *</Text> : null}
        </Text>
        {input}
      </View>
      {below}
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The add/edit form: a big amount, then Paid | Received (or I gave | I took),
 * a row of category icons to scroll and tap (with "+ New"), a Details card
 * (who, what for), More details, and Save fixed at the bottom of the screen.
 * Money received back and money returned show their type as text instead.
 *
 * onSubmit(values) should save and navigate away. If it throws, the error is
 * shown and everything typed stays in the form.
 * templates: pass an array (even empty) to show templates. Add does; Edit does not.
 * accounts: bank accounts to choose from. The row is hidden when there are none.
 * lockPerson: the name cannot be changed (opened from a person's page).
 * knownPeople: names already used for money given and taken, to ask "Same person as ...?".
 */
export function TransactionForm({
  categories,
  templates,
  accounts = [],
  initialValues,
  submitLabel,
  onSubmit,
  onDelete,
  lockPerson = false,
  amountHint,
  checkBeforeSave,
  knownPeople = [],
}) {
  const db = useSQLiteContext();
  const [form, setForm] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [categoryList, setCategoryList] = useState(categories);
  const [templateList, setTemplateList] = useState(templates ?? []);
  // Less used fields stay folded away until needed (or already filled in).
  const [showMoreDetails, setShowMoreDetails] = useState(Boolean(initialValues.reference || initialValues.notes));
  // Decided once, from the entry the form starts with.
  const [pair] = useState(() => pairFor(initialValues.loanType ?? null));
  // A ref updates instantly, unlike state, so a fast double tap cannot save twice.
  const savingRef = useRef(false);
  const templatesEnabled = templates != null;
  const received = form.direction === 'credit';
  const loan = form.loanType ? LOAN_TYPES[form.loanType] : null;
  // null for money received back / returned, which have no choice.
  const activity = activityFor(form);
  const personLabel = loan ? "Person's name" : received ? 'Received from whom?' : 'Paid to whom?';
  // "Rahul" when "Rahul Kumar" exists: probably the same person, so offer the existing name.
  const similarPeople = loan && !lockPerson ? findSimilarPeople(form.merchant, knownPeople) : [];

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

  // A choice sets both the direction and the loan type.
  // Money received starts in the Income category when none is chosen yet.
  function changeActivity(key) {
    const next = ACTIVITIES.find((candidate) => candidate.key === key);
    const changes = { direction: next.direction, loanType: next.loanType };
    if (key === 'received' && form.categoryId == null) {
      changes.categoryId = categoryList.find((category) => category.name === INCOME)?.id ?? null;
    }
    updateFields(changes);
  }

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
    // Loans are always saved under the "Loans" category.
    const result = validateTransactionForm({ ...form, categoryId: categoryIdForSave(form, categoryList) });
    setErrors(result.errors);
    if (!result.values) {
      // Open a folded section if the problem is inside it, so the message is visible.
      if (result.errors.paymentMethod || result.errors.occurredAt) {
        setShowMoreDetails(true);
      }
      return;
    }

    savingRef.current = true;
    setSaving(true);
    try {
      // Checks that need the database (such as the remaining amount) return field errors.
      const lateErrors = checkBeforeSave ? await checkBeforeSave(result.values) : null;
      if (lateErrors) {
        setErrors(lateErrors);
        savingRef.current = false;
        setSaving(false);
        return;
      }
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
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Templates are saved expenses, so they only fit "Paid". */}
        {templatesEnabled && activity?.key === 'paid' ? (
          <TemplateBar templates={templateList} onApply={handleApplyTemplate} onLongPress={handleDeleteTemplate} />
        ) : null}

        <View>
          <View style={styles.amountRow}>
            <Text style={[styles.rupee, { color: amountColor(form.direction) }]}>₹</Text>
            <TextInput
              value={form.amountText}
              onChangeText={(text) => update('amountText', text)}
              placeholder="0"
              placeholderTextColor={colors.border}
              keyboardType="decimal-pad"
              style={[styles.amount, { color: amountColor(form.direction) }]}
              accessibilityLabel={received ? 'Amount received in rupees' : 'Amount paid in rupees'}
              autoFocus={!form.amountText}
            />
          </View>
          {errors.amount ? (
            <Text style={[styles.error, styles.centered]} accessibilityLiveRegion="polite">
              {errors.amount}
            </Text>
          ) : amountHint ? (
            <Text style={[styles.hint, styles.centered]}>{amountHint}</Text>
          ) : null}
        </View>

        <View style={styles.typeBlock}>
          {pair && activity ? (
            <SegmentedControl options={pair} value={activity.key} onChange={changeActivity} />
          ) : (
            <Text style={styles.fixedType}>{loan?.choice}</Text>
          )}
          {errors.loanType ? <Text style={styles.error}>{errors.loanType}</Text> : null}
          {loan ? <Text style={styles.hint}>{loan.note}</Text> : null}
        </View>

        {/* Money given and taken is saved under "Loans", so there is no category to choose. */}
        {loan ? null : (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              Category<Text style={styles.required}> *</Text>
            </Text>
            <CategoryIconRow
              categories={pickableCategories(categoryList)}
              selectedId={form.categoryId}
              onSelect={(id) => update('categoryId', id)}
              onCreate={handleCreateCategory}
            />
            {errors.category ? <Text style={styles.error}>{errors.category}</Text> : null}
          </View>
        )}

        <Card>
          <DetailLine label={personLabel} required={Boolean(loan)} error={errors.merchant}>
            <TextInput
              value={form.merchant}
              onChangeText={(text) => update('merchant', text)}
              placeholder={loan ? "Person's name" : 'Shop or person'}
              placeholderTextColor={colors.textMuted}
              maxLength={80}
              editable={!lockPerson}
              style={[styles.detailInput, lockPerson && styles.locked]}
              accessibilityLabel={personLabel}
            />
            {lockPerson ? null : (
              <SuggestionChips
                label="Use name"
                suggestions={merchantSuggestions}
                onPick={(suggestion) => pickSuggestion('merchant', suggestion)}
              />
            )}
            {similarPeople.length > 0 ? (
              <View style={styles.similar}>
                <Text style={styles.similarText}>
                  {similarPeople.length === 1 ? `Same person as ${similarPeople[0]}?` : 'Same person as one of these?'}
                </Text>
                <View style={styles.chips}>
                  {similarPeople.map((name) => (
                    <Chip key={name} label={`Use ${name}`} onPress={() => update('merchant', name)} />
                  ))}
                </View>
              </View>
            ) : null}
          </DetailLine>
          <DetailLine label={loan ? 'Note' : 'What for?'} last>
            <TextInput
              value={form.purpose}
              onChangeText={(text) => update('purpose', text)}
              placeholder={loan ? 'Optional' : received ? 'For example: salary' : 'For example: groceries'}
              placeholderTextColor={colors.textMuted}
              maxLength={120}
              style={styles.detailInput}
              accessibilityLabel={loan ? 'Note' : 'What was it for?'}
            />
            {loan ? null : (
              <SuggestionChips
                label="Use purpose"
                suggestions={purposeSuggestions}
                onPick={(suggestion) => pickSuggestion('purpose', suggestion)}
              />
            )}
          </DetailLine>
        </Card>

        {/* Money given and taken shows the date up front; other entries keep it in More details. */}
        {loan ? (
          <FormField label="Date" error={errors.occurredAt}>
            <DateTimeField value={form.occurredAt} onChange={(value) => update('occurredAt', value)} />
          </FormField>
        ) : null}

        {showMoreDetails ? (
          <>
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

            {loan ? null : (
              <FormField label="Date and time" error={errors.occurredAt}>
                <DateTimeField value={form.occurredAt} onChange={(value) => update('occurredAt', value)} />
              </FormField>
            )}

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
          <TextLink
            label={
              loan
                ? `More details: ${form.paymentMethod}`
                : `More details: ${form.paymentMethod} · ${formatDate(form.occurredAt)}, ${formatTime(form.occurredAt)}`
            }
            onPress={() => setShowMoreDetails(true)}
            muted
          />
        )}

        {templatesEnabled && activity?.key === 'paid' ? (
          <TextLink label="Save as template" onPress={handleSaveTemplate} disabled={saving} />
        ) : null}
        {onDelete ? <Button label="Delete transaction" variant="danger" onPress={onDelete} disabled={saving} /> : null}
      </ScrollView>

      {/* Save stays visible at the bottom, however long the form is. */}
      <View style={styles.saveBar}>
        <Button label={submitLabel} onPress={handleSubmit} loading={saving} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  // Extra space at the bottom so the fixed Save bar never covers the last field.
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 120 },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.sm },
  rupee: { fontSize: fontSize.xxl, fontWeight: '600', marginRight: spacing.xs },
  amount: { fontSize: 40, fontWeight: '700', minWidth: 80, textAlign: 'center' },
  centered: { textAlign: 'center' },
  typeBlock: { gap: spacing.sm },
  fixedType: { fontSize: fontSize.lg, fontWeight: '700', color: colors.people, textAlign: 'center' },
  hint: { fontSize: fontSize.sm, color: colors.textMuted },
  error: { fontSize: fontSize.sm, color: colors.danger },
  required: { color: colors.danger },
  section: { gap: spacing.sm },
  sectionLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  detail: { paddingVertical: spacing.sm, gap: spacing.sm },
  detailBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  detailLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 40 },
  detailLabel: { width: 130, fontSize: fontSize.sm, color: colors.textMuted },
  detailInput: { flex: 1, textAlign: 'right', fontSize: fontSize.md, color: colors.text, paddingVertical: spacing.sm },
  locked: { color: colors.textMuted },
  similar: { gap: spacing.sm },
  similarText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.people },
  notes: { minHeight: 88, paddingTop: spacing.md, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  saveBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
