import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { pickVisibleCategories } from '../domain/transactionForm';
import { formatTime } from '../utils/dates';
import { formatINR } from '../utils/money';
import { sourceAppName } from '../utils/sourceApps';
import { Amount } from './Amount';
import { Button } from './Button';
import { Card } from './Card';
import { Chip } from './Chip';

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
 * Normal items: Add (main), Edit, Ignore. Possible duplicates: Ignore (main), Add anyway.
 */
export function DetectedPaymentCard({ item, categories, categoryId, onChangeCategory, busy, onAdd, onEdit, onIgnore }) {
  const [choosingCategory, setChoosingCategory] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const received = item.direction === 'credit';
  const duplicate = Boolean(item.possibleDuplicate);
  const category = categories.find((candidate) => candidate.id === categoryId);
  const shownCategories = showAllCategories ? categories : pickVisibleCategories(categories, categoryId);
  const source = [
    sourceAppName(item.sourcePackage),
    item.accountName,
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
        <View style={styles.amountRow}>
          <Text style={[styles.kind, { color: received ? colors.income : colors.expense }]}>
            {received ? '↓ Received' : '↑ Paid'}
          </Text>
          <Amount paise={item.amountPaise} direction={item.direction} size="xl" />
        </View>
        <Text style={styles.time}>{formatTime(item.postedAt)}</Text>
      </View>

      <Text style={styles.counterparty} numberOfLines={1}>
        {item.counterparty ? `${received ? 'From' : 'To'} ${item.counterparty}` : 'Name not shown in the message'}
      </Text>
      {source ? <Text style={styles.source}>{source}</Text> : null}

      {duplicate && item.original ? (
        <View style={styles.duplicateBox}>
          <Text style={styles.duplicateText}>{describeOriginal(item.original)}</Text>
        </View>
      ) : null}

      {duplicate ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Category: ${category?.name ?? 'not chosen'}. Change category`}
          onPress={() => setChoosingCategory(!choosingCategory)}
          style={styles.categoryRow}
          hitSlop={6}
        >
          <Text style={styles.categoryLabel}>Category</Text>
          <Text style={styles.categoryValue}>{category?.name ?? 'Choose'} ▾</Text>
        </Pressable>
      )}
      {choosingCategory ? (
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

      <View style={styles.actions}>
        {duplicate ? (
          <>
            <Button label="Ignore" onPress={onIgnore} disabled={busy} style={styles.action} />
            <Button label="Add anyway" variant="secondary" onPress={onAdd} disabled={busy} style={styles.action} />
          </>
        ) : (
          <>
            <Button label="Add" onPress={onAdd} disabled={busy || categoryId == null} style={styles.action} />
            <Button label="Edit" variant="secondary" onPress={onEdit} disabled={busy} style={styles.action} />
            <Button label="Ignore" variant="secondary" onPress={onIgnore} disabled={busy} style={styles.action} />
          </>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs },
  duplicateCard: { borderColor: colors.warning, borderWidth: 1 },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  amountRow: { gap: 2 },
  kind: { fontSize: fontSize.sm, fontWeight: '700' },
  time: { fontSize: fontSize.sm, color: colors.textMuted },
  counterparty: { fontSize: fontSize.md, fontWeight: '600', color: colors.text, marginTop: spacing.xs },
  source: { fontSize: fontSize.sm, color: colors.textMuted },
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
    minHeight: 44,
    marginTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  categoryLabel: { fontSize: fontSize.sm, color: colors.textMuted },
  categoryValue: { fontSize: fontSize.md, fontWeight: '600', color: colors.primary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.xs },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  action: { flex: 1, paddingHorizontal: spacing.sm },
});
