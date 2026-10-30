import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { amountColor, colors, fontSize, radius, spacing } from '../constants/theme';
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
 * Layout: who (title) and how much (right), then where it came from and when.
 * "What is this?" (expense/income or a loan), then one main button and smaller
 * links for Edit, Ignore and the full bank message. Possible duplicates make
 * Ignore the main action.
 */
export function DetectedPaymentCard({
  item,
  categories,
  categoryId,
  onChangeCategory,
  loanType,
  onChangeLoanType,
  busy,
  onAdd,
  onEdit,
  onIgnore,
}) {
  const [choosingCategory, setChoosingCategory] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);
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
    received ? '↓ Received' : '↑ Paid',
    sourceAppName(item.sourcePackage),
    item.accountName,
    formatTime(item.postedAt),
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
      <Text style={[styles.details, { color: amountColor(item.direction) }]}>{details}</Text>
      {item.reference ? <Text style={styles.reference}>UPI ref …{item.reference.slice(-4)}</Text> : null}

      {duplicate && item.original ? (
        <View style={styles.duplicateBox}>
          <Text style={styles.duplicateText}>{describeOriginal(item.original)}</Text>
        </View>
      ) : null}

      {duplicate ? null : (
        <View style={styles.loanRow}>
          <LoanTypePicker direction={item.direction} value={loanType} onChange={onChangeLoanType} />
        </View>
      )}

      {duplicate || loan ? null : (
        <View style={styles.categoryRow}>
          <Text style={styles.categoryLabel}>Category</Text>
          <TextLink label={`${category?.name ?? 'Choose'} ▾`} onPress={() => setChoosingCategory(!choosingCategory)} />
        </View>
      )}
      {loan ? <Text style={styles.loanNote}>{loan.note}</Text> : null}
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
            <TextLink label="Edit" onPress={onEdit} disabled={busy} />
            <TextLink label="Ignore" onPress={onIgnore} disabled={busy} muted />
          </>
        )}
        <TextLink
          label={showMessage ? 'Hide message' : 'Show message'}
          onPress={() => setShowMessage(!showMessage)}
          muted
        />
      </View>

      {showMessage ? (
        <View style={styles.messageBox}>
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
  details: { fontSize: fontSize.sm, fontWeight: '600' },
  reference: { fontSize: fontSize.sm, color: colors.textMuted },
  loanRow: { marginTop: spacing.sm },
  loanNote: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.xs },
  duplicateBox: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.warningSoft,
  },
  duplicateText: { fontSize: fontSize.sm, color: colors.warning },
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
  messageBox: {
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    gap: spacing.xs,
  },
  messageTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textMuted },
  messageText: { fontSize: fontSize.sm, color: colors.text },
});
