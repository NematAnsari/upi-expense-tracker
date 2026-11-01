import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, spacing } from '../constants/theme';
import { LOAN_TYPES } from '../domain/loans';
import { pickableCategories, pickVisibleCategories } from '../domain/transactionForm';
import { formatTime } from '../utils/dates';
import { formatINR } from '../utils/money';
import { sourceAppName } from '../utils/sourceApps';
import { Amount } from './Amount';
import { Button } from './Button';
import { Card } from './Card';
import { Chip } from './Chip';
import { LoanTypePicker } from './LoanTypePicker';
import { TextLink } from './TextLink';

/** "Looks like a repeat of ₹1.00 received at 4:37 PM (SMS · BOI ••2222)." */
function describeOriginal(original) {
  const what = `${formatINR(original.amountPaise)} ${original.direction === 'credit' ? 'received' : 'paid'}`;
  const where =
    original.kind === 'saved'
      ? 'already in your transactions'
      : [sourceAppName(original.sourcePackage), original.accountName].filter(Boolean).join(' · ');
  return `Looks like a repeat of ${what} at ${formatTime(original.at)} (${where}). Usually safe to ignore.`;
}

/**
 * One payment found in a bank SMS or UPI app notification, waiting for review.
 *
 * Layout: who (title) and how much (right), one line of details, "What is
 * this?" (expense/income, or money given/taken), the category for an expense
 * or income, one main button and small links (Review details, Ignore, Bank
 * message). Nothing is assumed: the choice is always visible before adding.
 * Possible duplicates make Ignore the main action.
 */
export function DetectedPaymentCard({
  item,
  categories,
  categoryId,
  onChangeCategory,
  loanType,
  onChangeLoanType,
  suggestionNote,
  busy,
  onAdd,
  onEdit,
  onIgnore,
}) {
  const [choosingCategory, setChoosingCategory] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);
  // The full bank message stays folded away until asked for.
  const [showMessage, setShowMessage] = useState(false);

  const received = item.direction === 'credit';
  const duplicate = Boolean(item.possibleDuplicate);
  const loan = loanType ? LOAN_TYPES[loanType] : null;
  // A loan is tracked per person, so it cannot be saved without a name.
  const needsName = Boolean(loan) && !item.counterparty;
  const pickable = pickableCategories(categories);
  const category = categories.find((candidate) => candidate.id === categoryId);
  const shownCategories = showAllCategories ? pickable : pickVisibleCategories(pickable, categoryId);
  const mainLabel = loan ? (needsName ? 'Add name and save' : loan.addLabel) : received ? 'Add income' : 'Add expense';
  const title = item.counterparty ?? (received ? 'Money received' : 'Payment made');
  const details = [
    received ? 'Received' : 'Paid',
    sourceAppName(item.sourcePackage),
    item.accountName,
    formatTime(item.postedAt),
    item.reference ? `Ref …${item.reference.slice(-4)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  function chooseCategory(id) {
    onChangeCategory(id);
    setChoosingCategory(false);
    setShowAllCategories(false);
  }

  return (
    <Card style={[styles.card, duplicate && styles.duplicateCard]}>
      <View style={styles.top}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <Amount paise={item.amountPaise} direction={item.direction} size="xl" showSign />
      </View>
      <Text style={styles.details}>{details}</Text>

      {duplicate && item.original ? <Text style={styles.duplicateText}>{describeOriginal(item.original)}</Text> : null}

      {duplicate ? null : (
        <View style={styles.choice}>
          <Text style={styles.optionLabel}>What is this?</Text>
          <LoanTypePicker direction={item.direction} value={loanType} onChange={onChangeLoanType} />
          {suggestionNote ? <Text style={styles.suggestion}>{suggestionNote}</Text> : null}
          {loan ? <Text style={styles.note}>{loan.note}</Text> : null}
        </View>
      )}

      {duplicate || loan ? null : (
        <View style={styles.categoryRow}>
          <Text style={styles.categoryLabel}>Category</Text>
          <TextLink label={`${category?.name ?? 'Choose'} ▾`} onPress={() => setChoosingCategory(!choosingCategory)} />
        </View>
      )}
      {choosingCategory && !loan ? (
        <View style={styles.chips}>
          {shownCategories.map((option) => (
            <Chip
              key={option.id}
              label={option.name}
              selected={option.id === categoryId}
              onPress={() => chooseCategory(option.id)}
            />
          ))}
          {showAllCategories ? null : <Chip label="More…" onPress={() => setShowAllCategories(true)} />}
        </View>
      ) : null}

      {duplicate ? (
        <Button label="Ignore duplicate" onPress={onIgnore} disabled={busy} style={styles.mainButton} />
      ) : (
        <Button
          label={mainLabel}
          onPress={needsName ? onEdit : onAdd}
          disabled={busy || (!loan && categoryId == null)}
          style={styles.mainButton}
        />
      )}

      <View style={styles.links}>
        {duplicate ? (
          <TextLink label="Add anyway" onPress={onAdd} disabled={busy} />
        ) : (
          <>
            <TextLink label="Review details" onPress={onEdit} disabled={busy} />
            <TextLink label="Ignore" onPress={onIgnore} disabled={busy} muted />
          </>
        )}
        <TextLink
          label={showMessage ? 'Hide message' : 'Bank message'}
          onPress={() => setShowMessage(!showMessage)}
          muted
        />
      </View>

      {showMessage ? (
        <View style={styles.options}>
          {item.title ? <Text style={styles.messageTitle}>{item.title}</Text> : null}
          <Text style={styles.messageText} selectable>
            {item.rawText}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs },
  duplicateCard: { borderColor: colors.warning, borderWidth: 1 },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  title: { flex: 1, fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  details: { fontSize: fontSize.sm, color: colors.textMuted },
  duplicateText: { fontSize: fontSize.sm, color: colors.warning, marginTop: spacing.sm },
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  categoryLabel: { fontSize: fontSize.sm, color: colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.xs },
  mainButton: { marginTop: spacing.sm },
  links: { flexDirection: 'row', justifyContent: 'space-around' },
  options: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  choice: { gap: spacing.sm, marginTop: spacing.sm },
  suggestion: { fontSize: fontSize.sm, fontWeight: '600', color: colors.people },
  optionLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  note: { fontSize: fontSize.sm, color: colors.textMuted },
  messageTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textMuted },
  messageText: { fontSize: fontSize.sm, color: colors.textMuted },
});
