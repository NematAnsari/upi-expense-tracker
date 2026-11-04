import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { emptySplit, previewMyShare } from '../domain/split';
import { formatINR } from '../utils/money';
import { Card } from './Card';
import { ICONS, OutlineIcon } from './icons';
import { TextLink } from './TextLink';

/** "Rahul Sharma" -> "RS"; a dot while no name is typed yet. */
function initials(name) {
  const letters = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return letters || '•';
}

/**
 * The small "Split" pill under the amount on the expense form. Tap it to start
 * a split (adds the first person); while splitting it shows "Split on", and
 * tapping it again removes the split.
 */
export function SplitToggle({ splits, onChange }) {
  const active = splits.length > 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={active ? 'Remove the split' : 'Split with someone'}
      accessibilityState={{ selected: active }}
      onPress={() => onChange(active ? [] : [emptySplit(Date.now())])}
      hitSlop={6}
      style={({ pressed }) => [styles.toggle, active && styles.toggleActive, pressed && styles.pressed]}
    >
      <OutlineIcon draw={ICONS.people} color={active ? colors.onPrimary : colors.primary} size={14} />
      <Text style={[styles.toggleText, active && styles.toggleTextActive]}>
        {active ? 'Split on  ✕' : 'Split with someone'}
      </Text>
    </Pressable>
  );
}

/**
 * The split card, shown under Paid | Received while splitting:
 *   Split
 *   You                         ₹600.00
 *   ████████████░░░░░░░░                    your share vs theirs
 *   (RK) Rahul          ₹ 400        ✕
 *   + Add person
 *   Rahul's share goes to Given & Taken as "I gave money".
 * splits: [{ key, merchant, amountText }]. onChange(nextSplits).
 * totalText: the amount typed at the top, for your share.
 */
export function SplitCard({ splits, onChange, totalText, error }) {
  if (splits.length === 0) {
    return null;
  }

  const nextKey = Math.max(...splits.map((split) => split.key)) + 1;
  const myShare = previewMyShare(totalText, splits);
  const total = previewMyShare(totalText, []);
  // Your part of the bar, 0 to 1. Only when the amounts make sense.
  const myPart = myShare != null && total > 0 ? Math.min(Math.max(myShare / total, 0), 1) : null;
  const names = splits.map((split) => split.merchant.trim()).filter(Boolean);
  const whose = names.length === 1 ? `${names[0]}'s share goes` : 'Their shares go';
  const change = (key, field, value) =>
    onChange(splits.map((split) => (split.key === key ? { ...split, [field]: value } : split)));

  return (
    <Card title="Split">
      <View style={styles.you}>
        <Text style={styles.youLabel}>You</Text>
        <Text style={[styles.youAmount, myShare != null && myShare <= 0 && styles.youAmountError]}>
          {myShare != null ? formatINR(Math.max(myShare, 0)) : '–'}
        </Text>
      </View>
      {myPart != null ? (
        <View style={styles.bar} accessible accessibilityLabel={`Your share is ${Math.round(myPart * 100)} percent`}>
          <View style={[styles.barYou, { flex: myPart }]} />
          <View style={[styles.barThem, { flex: 1 - myPart }]} />
        </View>
      ) : null}

      {splits.map((split, index) => (
        <View key={split.key} style={styles.row}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(split.merchant)}</Text>
          </View>
          <TextInput
            value={split.merchant}
            onChangeText={(text) => change(split.key, 'merchant', text)}
            placeholder="Name"
            placeholderTextColor={colors.textMuted}
            maxLength={80}
            autoFocus={index === splits.length - 1 && !split.merchant}
            style={styles.name}
            accessibilityLabel={`Name of person ${index + 1}`}
          />
          <View style={styles.amountBox}>
            <Text style={styles.rupee}>₹</Text>
            <TextInput
              value={split.amountText}
              onChangeText={(text) => change(split.key, 'amountText', text)}
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              style={styles.amount}
              accessibilityLabel={`Their share, person ${index + 1}`}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove person ${index + 1}`}
            onPress={() => onChange(splits.filter((item) => item.key !== split.key))}
            hitSlop={8}
            style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
          >
            <Text style={styles.removeText}>✕</Text>
          </Pressable>
        </View>
      ))}

      <View style={styles.footer}>
        <TextLink label="+ Add person" onPress={() => onChange([...splits, emptySplit(nextKey)])} />
        <Text style={styles.note}>{`${whose} to Given & Taken as "I gave money".`}</Text>
        {error ? (
          <Text style={styles.errorText} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.6 },
  toggle: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  toggleActive: { backgroundColor: colors.primary },
  toggleText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.primary },
  toggleTextActive: { color: colors.onPrimary },
  you: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  youLabel: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  youAmount: { fontSize: fontSize.lg, fontWeight: '700', color: colors.expense },
  youAmountError: { color: colors.danger },
  // Your share (teal) next to the others' share (people colour).
  bar: {
    flexDirection: 'row',
    height: 6,
    borderRadius: radius.pill,
    overflow: 'hidden',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    backgroundColor: colors.background,
  },
  barYou: { backgroundColor: colors.primary },
  barThem: { backgroundColor: colors.people, opacity: 0.45 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 52,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  avatarText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.people },
  name: { flex: 1, fontSize: fontSize.md, color: colors.text, paddingVertical: spacing.sm },
  amountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
  },
  rupee: { fontSize: fontSize.md, color: colors.textMuted },
  amount: { minWidth: 64, textAlign: 'right', fontSize: fontSize.md, color: colors.text, paddingVertical: spacing.xs },
  remove: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: { fontSize: fontSize.sm, color: colors.textMuted },
  footer: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    alignItems: 'flex-start',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  note: { fontSize: fontSize.sm, color: colors.textMuted },
  errorText: { fontSize: fontSize.sm, color: colors.danger },
});
