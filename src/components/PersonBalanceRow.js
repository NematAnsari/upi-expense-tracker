import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { balanceParts, timelineText } from '../domain/loans';
import { formatINR } from '../utils/money';
import { Amount } from './Amount';
import { STATUS_COLORS, StatusIcon } from './StatusIcon';

// Colour and words for each kind of remaining amount. Green: money coming back
// to you. Red: money you still have to return. Grey: nothing left. The words
// always say it too, so colour is only a quick hint.
const STATUS = {
  owesYou: { text: 'left to receive', color: colors.income, soft: colors.incomeSoft, direction: 'credit' },
  youOwe: { text: 'left to return', color: colors.expense, soft: colors.expenseSoft, direction: 'debit' },
  settled: { text: 'Fully settled', color: colors.textMuted, soft: colors.background, direction: null },
};

/**
 * One person in Money given and taken:
 *    (clock)   Rahul                              ₹57,000.00
 *    4 days    Gave: ₹59,000.00               [left to receive]
 *              Got back: ₹2,000.00
 *              31st Oct 2026
 * The icon says it all: a clock while pending (date = when it started, time =
 * how long it has been open), a tick once settled (date = when it was settled,
 * time = how long it took). Amounts keep the red (money out) and green (money in) rule.
 */
export function PersonBalanceRow({ person, onPress }) {
  const status = STATUS[person.status];
  const iconStatus = person.status === 'settled' ? 'settled' : 'pending';
  const parts = balanceParts(person);
  const timeline = timelineText(person);
  const spoken = parts.map((part) => `${part.short} ${formatINR(part.paise)}`).join(', ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${person.person}, ${status.direction ? `${formatINR(person.amountPaise)} ${status.text}` : status.text}. ${spoken}${timeline ? `. ${timeline.spoken}` : ''}`}
      accessibilityHint="Opens this person's page"
      onPress={() => onPress(person)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.left}>
        <StatusIcon status={iconStatus} />
        {timeline ? (
          <Text style={[styles.duration, { color: STATUS_COLORS[iconStatus] }]} numberOfLines={1}>
            {timeline.duration}
          </Text>
        ) : null}
      </View>
      <View style={styles.main}>
        <Text style={styles.name} numberOfLines={1}>
          {person.person}
        </Text>
        {parts.map((part) => (
          <Text key={part.short} style={styles.part}>
            {`${part.short}: `}
            <Amount paise={part.paise} direction={part.direction} size="sm" bold={false} />
          </Text>
        ))}
        {timeline ? <Text style={styles.date}>{timeline.date}</Text> : null}
      </View>
      <View style={styles.right}>
        {status.direction ? <Amount paise={person.amountPaise} direction={status.direction} size="lg" /> : null}
        <View style={[styles.pill, { backgroundColor: status.soft }]}>
          <Text style={[styles.pillText, { color: status.color }]}>{status.text}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.md },
  pressed: { opacity: 0.6 },
  // Wide enough for "11 months" under the 32 px icon.
  left: { width: 60, alignItems: 'center', gap: spacing.xs },
  duration: { fontSize: fontSize.sm, fontWeight: '700' },
  main: { flex: 1, gap: 2 },
  name: { fontSize: fontSize.md, fontWeight: '700', color: colors.text, marginBottom: 2 },
  part: { fontSize: fontSize.sm, color: colors.textMuted },
  date: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  right: { alignItems: 'flex-end', gap: spacing.xs },
  // Kept small and light so the amount above stays the main number.
  pill: { paddingHorizontal: spacing.sm, paddingVertical: 1, borderRadius: radius.pill },
  pillText: { fontSize: fontSize.xs, fontWeight: '500' },
});
