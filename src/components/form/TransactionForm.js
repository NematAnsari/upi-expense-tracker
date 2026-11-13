import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import { INCOME } from '../../constants/categories';
import { amountColor, colors, fontSize, spacing } from '../../constants/theme';
import { createAccount } from '../../db/accounts';
import { createCategory } from '../../db/categories';
import { suggestMerchants, suggestPurposes } from '../../db/suggestions';
import { LOAN_TYPES, takesDueDate } from '../../domain/entryTypes';
import { findSimilarPeople } from '../../domain/people';
import { validateSplits } from '../../domain/split';
import {
  ACTIVITIES,
  activityFor,
  categoryIdForSave,
  findCategory,
  pickableCategories,
  pickableCategoryId,
} from '../../domain/transactionForm';
import { validateTransactionForm } from '../../domain/validation';
import { useAsyncValue } from '../../hooks/useAsyncValue';
import { Button } from '../basics/Button';
import { Card } from '../basics/Card';
import { Chip } from '../basics/Chip';
import { SegmentedControl } from '../basics/SegmentedControl';
import { TextLink } from '../basics/TextLink';
import { CategoryIconRow } from './CategoryIconRow';
import { DetailLine } from './DetailLine';
import { DueDateInput } from './DueDateInput';
import { titleFor, typeChoicesFor } from './formChoices';
import { MoreDetailsCard } from './MoreDetailsCard';
import { SplitCard, SplitToggle } from './SplitCard';
import { SuggestionChips } from './SuggestionChips';
import { TemplateBar } from './TemplateBar';
import { useTemplates } from './useTemplates';

// Room the fixed Save bar takes at the bottom of the screen.
const SAVE_BAR_SPACE = 100;

// Which error message belongs to which form field.
const ERROR_KEY_FOR_FIELD = { amountText: 'amount', categoryId: 'category' };

/**
 * The add/edit form: a big amount, then Paid | Received (or I gave | I took),
 * category icons (with "+ New"), a Details card (who, what for), a More details
 * card, and Save fixed at the bottom. Money received back and money returned
 * show their type as text instead.
 *
 * categories: all categories. accounts: bank accounts ("+ New" adds one).
 * templates: an array (even empty) shows templates; Add passes it, Edit does not.
 * initialValues: the form to start with. submitLabel: the Save button's text.
 * onSubmit(values, split): saves and navigates away; if it throws, the error is shown and the form is kept.
 * onDelete: shows "Delete transaction" (Edit only).
 * lockPerson: the name cannot be changed (opened from a person's page).
 * amountHint: a line under the amount, such as what is left to return.
 * checkBeforeSave(values): database checks; returns field errors or null.
 * knownPeople: names already used for money given and taken, to ask "Same person as ...?".
 * mode: 'add' or 'edit', for the screen title.
 * allowSplit: offer "Split with someone" on an expense; split is { parts, loansCategoryId } or null.
 * lockType: the type is shown as text and cannot be switched (a bank SMS already says paid or received).
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
  mode = 'add',
  allowSplit = false,
  lockType = false,
}) {
  const db = useSQLiteContext();
  const [form, setForm] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [categoryList, setCategoryList] = useState(categories);
  const [accountList, setAccountList] = useState(accounts);
  // A payment to a shop account keeps its type: it only lowers what is due there.
  const shopPayment = initialValues.shopEntry === 'payment';
  // Decided once, from the entry the form starts with.
  const [typeChoices] = useState(() =>
    shopPayment || lockType ? null : typeChoicesFor(initialValues.loanType ?? null),
  );
  // A ref updates instantly, unlike state, so a fast double tap cannot save twice.
  const savingRef = useRef(false);
  const { templateList, pickTemplate, confirmDeleteTemplate, saveFormAsTemplate } = useTemplates({
    db,
    templates,
    form,
    setForm,
    setErrors,
    categories: categoryList,
  });

  const received = form.direction === 'credit';
  const loan = form.loanType ? LOAN_TYPES[form.loanType] : null;
  // null for money received back / returned, which have no choice.
  const activity = activityFor(form);
  const paying = activity?.key === 'paid';
  // Templates are saved expenses, so they only fit "Paid".
  const showTemplates = templates != null && paying;
  const personLabel = loan ? "Person's name" : received ? 'Received from whom?' : 'Paid to whom?';
  // "Rahul" when "Rahul Kumar" exists: probably the same person, so offer the existing name.
  const similarPeople = loan && !lockPerson ? findSimilarPeople(form.merchant, knownPeople) : [];
  const splits = form.splits ?? [];
  const splitting = allowSplit && paying && splits.length > 0;

  const loadMerchantSuggestions = useCallback(() => suggestMerchants(db, form.merchant), [db, form.merchant]);
  const loadPurposeSuggestions = useCallback(
    () => suggestPurposes(db, form.purpose, form.categoryId),
    [db, form.purpose, form.categoryId],
  );
  const merchantSuggestions = useAsyncValue(loadMerchantSuggestions, []);
  const purposeSuggestions = useAsyncValue(loadPurposeSuggestions, []);

  function setFields(changes) {
    setForm((current) => ({ ...current, ...changes }));
    setErrors((current) => {
      const next = { ...current };
      for (const field of Object.keys(changes)) {
        delete next[ERROR_KEY_FOR_FIELD[field] ?? field];
      }
      return next;
    });
  }

  const setField = (field, value) => setFields({ [field]: value });

  // A choice sets both the direction and the loan type.
  // Money received starts in the Income category when none is chosen yet.
  function changeActivity(key) {
    const next = ACTIVITIES.find((candidate) => candidate.key === key);
    const changes = { direction: next.direction, loanType: next.loanType };
    if (key === 'received' && form.categoryId == null) {
      changes.categoryId = findCategory(categoryList, INCOME)?.id ?? null;
    }
    setFields(changes);
  }

  // Picking a remembered merchant or purpose also fills an empty category.
  function pickSuggestion(field, suggestion) {
    const changes = { [field]: suggestion.value };
    // Only a category you can pick by hand, never the hidden "Loans" one.
    const suggestedCategoryId = pickableCategoryId(categoryList, suggestion.categoryId);
    if (form.categoryId == null && suggestedCategoryId != null) {
      changes.categoryId = suggestedCategoryId;
    }
    setFields(changes);
  }

  // "+ New" in More details: saves the account; the card then selects it.
  async function handleCreateAccount(name) {
    const account = await createAccount(db, name);
    setAccountList((current) => [...current, account]);
    return account;
  }

  async function handleCreateCategory(name) {
    const category = await createCategory(db, name);
    setCategoryList((current) => [...current, category]);
    return category;
  }

  async function handleSubmit() {
    if (savingRef.current) {
      return;
    }
    // Loans are always saved under the "Loans" category.
    const result = validateTransactionForm({ ...form, categoryId: categoryIdForSave(form, categoryList) });
    setErrors(result.errors);
    if (!result.values) {
      return;
    }

    // A split payment saves your share as the expense and the rest as money given.
    let split = null;
    if (splitting) {
      const checked = validateSplits(result.values.amountPaise, splits);
      if (checked.error) {
        setErrors({ splits: checked.error });
        return;
      }
      result.values.amountPaise = checked.myPaise;
      split = { parts: checked.parts, loansCategoryId: categoryIdForSave({ loanType: 'lent' }, categoryList) };
    }

    savingRef.current = true;
    setSaving(true);
    try {
      // Checks that need the database (such as the remaining amount) return field errors.
      const databaseErrors = checkBeforeSave ? await checkBeforeSave(result.values) : null;
      if (databaseErrors) {
        setErrors(databaseErrors);
        savingRef.current = false;
        setSaving(false);
        return;
      }
      await onSubmit(result.values, split);
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
      <Stack.Screen options={{ title: titleFor(form, mode) }} />
      {/* Scrolls the box you are typing in above the keyboard (and the Save bar). */}
      <KeyboardAwareScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        bottomOffset={SAVE_BAR_SPACE}
      >
        {showTemplates ? (
          <TemplateBar templates={templateList} onApply={pickTemplate} onLongPress={confirmDeleteTemplate} />
        ) : null}

        <View>
          <View style={styles.amountRow}>
            <Text style={[styles.rupee, { color: amountColor(form.direction) }]}>₹</Text>
            <TextInput
              value={form.amountText}
              onChangeText={(text) => setField('amountText', text)}
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
          {/* Splitting belongs with the amount: part of it was paid for someone else. */}
          {allowSplit && paying ? (
            <View style={styles.splitToggle}>
              <SplitToggle splits={splits} onChange={(next) => setField('splits', next)} />
            </View>
          ) : null}
        </View>

        <View style={styles.typeBlock}>
          {typeChoices && activity ? (
            <SegmentedControl options={typeChoices} value={activity.key} onChange={changeActivity} />
          ) : (
            <Text style={styles.fixedType}>
              {shopPayment ? `Payment to ${form.shopName}` : (loan?.choice ?? (received ? 'Received' : 'Paid'))}
            </Text>
          )}
          {errors.loanType ? <Text style={styles.error}>{errors.loanType}</Text> : null}
          {loan ? <Text style={styles.hint}>{loan.note}</Text> : null}
          {shopPayment ? (
            <Text style={styles.hint}>Lowers what is due at this shop. Not counted as spending again.</Text>
          ) : null}
        </View>

        {splitting ? (
          <SplitCard
            splits={splits}
            onChange={(next) => setField('splits', next)}
            totalText={form.amountText}
            error={errors.splits}
          />
        ) : null}

        {/* Money given and taken is saved under "Loans", so there is no category to choose. */}
        {loan || shopPayment ? null : (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              Category<Text style={styles.required}> *</Text>
            </Text>
            <CategoryIconRow
              categories={pickableCategories(categoryList)}
              selectedId={form.categoryId}
              onSelect={(id) => setField('categoryId', id)}
              onCreate={handleCreateCategory}
            />
            {errors.category ? <Text style={styles.error}>{errors.category}</Text> : null}
          </View>
        )}

        <Card>
          <DetailLine label={personLabel} required={Boolean(loan)} error={errors.merchant}>
            <TextInput
              value={form.merchant}
              onChangeText={(text) => setField('merchant', text)}
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
                    <Chip key={name} label={`Use ${name}`} onPress={() => setField('merchant', name)} />
                  ))}
                </View>
              </View>
            ) : null}
          </DetailLine>
          {takesDueDate(form.loanType) ? (
            <DetailLine label="Return by" error={errors.dueAt}>
              <DueDateInput
                value={form.dueAt ?? null}
                minimumMs={form.occurredAt}
                onChange={(value) => setField('dueAt', value)}
              />
            </DetailLine>
          ) : null}
          <DetailLine label={loan ? 'Note' : 'What for?'} last>
            <TextInput
              value={form.purpose}
              onChangeText={(text) => setField('purpose', text)}
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

        <MoreDetailsCard
          values={form}
          onChange={setField}
          accounts={accountList}
          onCreateAccount={handleCreateAccount}
          errors={errors}
        />

        {showTemplates ? <TextLink label="Save as template" onPress={saveFormAsTemplate} disabled={saving} /> : null}
        {onDelete ? <Button label="Delete transaction" variant="danger" onPress={onDelete} disabled={saving} /> : null}
      </KeyboardAwareScrollView>

      {/* Save stays visible at the bottom, however long the form is, and rides on top of the keyboard. */}
      <KeyboardStickyView style={styles.saveBar}>
        <Button label={submitLabel} onPress={handleSubmit} loading={saving} />
      </KeyboardStickyView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  // Room at the end so the fixed Save bar never covers the last field.
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: SAVE_BAR_SPACE + 20 },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.sm },
  rupee: { fontSize: fontSize.xxl, fontWeight: '600', marginRight: spacing.xs },
  amount: { fontSize: 40, fontWeight: '700', minWidth: 80, textAlign: 'center' },
  centered: { textAlign: 'center' },
  splitToggle: { marginTop: spacing.sm },
  typeBlock: { gap: spacing.sm },
  fixedType: { fontSize: fontSize.lg, fontWeight: '700', color: colors.people, textAlign: 'center' },
  hint: { fontSize: fontSize.sm, color: colors.textMuted },
  error: { fontSize: fontSize.sm, color: colors.danger },
  required: { color: colors.danger },
  section: { gap: spacing.sm },
  sectionLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  detailInput: { flex: 1, textAlign: 'right', fontSize: fontSize.md, color: colors.text, paddingVertical: spacing.sm },
  locked: { color: colors.textMuted },
  similar: { gap: spacing.sm },
  similarText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.people },
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
