import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { LOAN_TYPES } from '../domain/loans';
import { pickableCategories } from '../domain/transactionForm';
import { formatShortDate, formatTime } from '../utils/dates';
import { formatINR } from '../utils/money';
import { sourceAppName } from '../utils/sourceApps';
import { Amount } from './Amount';
import { Button } from './Button';
import { Card } from './Card';
import { CategoryIconRow } from './CategoryIconRow';
import { ICONS, METHOD_ICONS, OutlineIcon } from './icons';
import { SegmentedControl } from './SegmentedControl';
import { TextLink } from './TextLink';

// "What is this?" as a choice bar, short enough for three on a card.
// `none` stands for a normal expense or income (no loan type).
const CHOICES = {
  debit: [
    { value: 'none', label: 'Expense' },
    { value: 'lent', label: 'I gave' },
    { value: 'borrowed_repaid', label: 'Returned' },
  ],
  credit: [
    { value: 'none', label: 'Income' },
    { value: 'borrowed', label: 'I took' },
    { value: 'lent_repaid', label: 'Received back' },
  ],
};

/** "Looks like a repeat of ₹1.00 received at 4:37 PM (SMS · BOI ••2222)." */
function describeOriginal(original) {
  const what = `${formatINR(original.amountPaise)} ${original.direction === 'credit' ? 'received' : 'paid'}`;
  const where =
    original.kind === 'saved'
      ? 'already in your transactions'
      : [sourceAppName(original.sourcePackage), original.accountName].filter(Boolean).join(' · ');
  return `Looks like a repeat of ${what} at ${formatTime(original.at)} (${where}). Usually safe to ignore.`;
}

/** A read-only line like the form's More details: icon, label, value on the right. */
function InfoLine({ draw, label, value, last }) {
  return (
    <View style={[styles.line, !last && styles.lineBorder]}>
      <View style={styles.lineIcon}>
        <OutlineIcon draw={draw} />
      </View>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={styles.lineValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/**
 * One payment found in a bank SMS or UPI app notification, waiting for review.
 * Laid out like the Add/Edit form:
 *   Rahul Kumar                     −₹500.00
 *   [ Expense | I gave | Returned ]            what is this?
 *   Category *  (icons, scroll sideways, + New)   expenses and income only
 *   (card) Payment method · (bank) Bank account · (cal) Date & time · (#) UPI reference · Found in
 *   [ Add expense ]
 *   Review details · Ignore · Bank message
 * Nothing is assumed: the choice is always visible before adding.
 * Possible duplicates hide the choices and make Ignore the main action.
 * onCreateCategory(name) saves a new category and returns it (or throws).
 */
export function DetectedPaymentCard({
  item,
  categories,
  categoryId,
  onChangeCategory,
  onCreateCategory,
  loanType,
  onChangeLoanType,
  suggestionNote,
  busy,
  onAdd,
  onEdit,
  onIgnore,
}) {
  // The full bank message stays folded away until asked for.
  const [showMessage, setShowMessage] = useState(false);

  const received = item.direction === 'credit';
  const duplicate = Boolean(item.possibleDuplicate);
  const loan = loanType ? LOAN_TYPES[loanType] : null;
  // A loan is tracked per person, so it cannot be saved without a name.
  const needsName = Boolean(loan) && !item.counterparty;
  const mainLabel = loan ? (needsName ? 'Add name and save' : loan.addLabel) : received ? 'Add income' : 'Add expense';
  const title = item.counterparty ?? (received ? 'Money received' : 'Payment made');

  return (
    <Card style={[styles.card, duplicate && styles.duplicateCard]}>
      <View style={styles.top}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <Amount paise={item.amountPaise} direction={item.direction} size="xl" showSign />
      </View>

      {duplicate && item.original ? <Text style={styles.duplicateText}>{describeOriginal(item.original)}</Text> : null}

      {duplicate ? null : (
        <View style={styles.block}>
          <SegmentedControl
            options={CHOICES[item.direction] ?? CHOICES.debit}
            value={loanType ?? 'none'}
            onChange={(value) => onChangeLoanType(value === 'none' ? null : value)}
            small
          />
          {suggestionNote ? <Text style={styles.suggestion}>{suggestionNote}</Text> : null}
          {loan ? <Text style={styles.note}>{loan.note}</Text> : null}
        </View>
      )}

      {/* Money given and taken is saved under "Loans", so there is no category to choose. */}
      {duplicate || loan ? null : (
        <View style={styles.block}>
          <Text style={styles.sectionLabel}>
            Category<Text style={styles.required}> *</Text>
          </Text>
          <CategoryIconRow
            categories={pickableCategories(categories)}
            selectedId={categoryId}
            onSelect={onChangeCategory}
            onCreate={onCreateCategory}
          />
        </View>
      )}

      <View style={styles.lines}>
        <InfoLine draw={METHOD_ICONS.UPI} label="Payment method" value="UPI" />
        <InfoLine draw={ICONS.bank} label="Bank account" value={item.accountName ?? 'Not known'} />
        <InfoLine
          draw={ICONS.date}
          label="Date & time"
          value={`${formatShortDate(item.postedAt)}, ${formatTime(item.postedAt)}`}
        />
        {item.reference ? <InfoLine draw={ICONS.reference} label="UPI reference" value={item.reference} /> : null}
        <InfoLine
          draw={ICONS.notes}
          label="Found in"
          value={sourceAppName(item.sourcePackage) ?? 'Notification'}
          last
        />
      </View>

      {duplicate ? (
        <Button label="Ignore duplicate" onPress={onIgnore} disabled={busy} />
      ) : (
        <Button
          label={mainLabel}
          onPress={needsName ? onEdit : onAdd}
          disabled={busy || (!loan && categoryId == null)}
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
        <View style={styles.message}>
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
  card: { gap: spacing.md },
  duplicateCard: { borderColor: colors.warning, borderWidth: 1 },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  title: { flex: 1, fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  duplicateText: { fontSize: fontSize.sm, color: colors.warning },
  block: { gap: spacing.sm },
  sectionLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  required: { color: colors.danger },
  suggestion: { fontSize: fontSize.sm, fontWeight: '600', color: colors.people },
  note: { fontSize: fontSize.sm, color: colors.textMuted },
  // Same look as the form's More details lines, a little shorter.
  lines: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
  lineBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  lineIcon: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  lineLabel: { width: 110, fontSize: fontSize.sm, color: colors.textMuted },
  lineValue: { flex: 1, textAlign: 'right', fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  links: { flexDirection: 'row', justifyContent: 'space-around' },
  message: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  messageTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textMuted },
  messageText: { fontSize: fontSize.sm, color: colors.textMuted },
});
