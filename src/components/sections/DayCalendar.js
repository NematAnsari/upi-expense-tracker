// Reports "Day by day": the month as a calendar for Spent, Received, Given or
// Taken. Bigger days are a deeper teal; tap a day to see its four totals.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { formatINRShort } from '../../utils/money';
import { plural } from '../../utils/text';
import { Amount } from '../basics/Amount';
import { Card } from '../basics/Card';

/** The four day totals: name, money color and the word for one entry. */
export const DAY_KINDS = {
  spent: { label: 'Spent', direction: 'debit', one: 'expense', many: 'expenses' },
  received: { label: 'Received', direction: 'credit', one: 'payment', many: 'payments' },
  given: { label: 'Given', direction: 'debit', one: 'time', many: 'times' },
  taken: { label: 'Taken', direction: 'credit', one: 'time', many: 'times' },
};
export const DAY_KIND_OPTIONS = Object.entries(DAY_KINDS).map(([value, { label }]) => ({ value, label }));

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Mon, 3 Nov" */
function dayTitle(ms) {
  const date = new Date(ms);
  return `${WEEKDAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** Short amounts for a calendar cell: ₹950, ₹1.2k, ₹1.5L. */
function compactINR(paise) {
  const rupees = paise / 100;
  if (rupees >= 100000) {
    return `₹${(rupees / 100000).toFixed(1).replace(/\.0$/, '')}L`;
  }
  if (rupees >= 1000) {
    return `₹${(rupees / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  }
  return `₹${Math.round(rupees)}`;
}

const entriesText = (total, kind) => plural(total.count, DAY_KINDS[kind].one, DAY_KINDS[kind].many);

/** "Spent this month  ₹4,200.00  18 expenses" */
export function DayKindTotal({ days, kind }) {
  const total = days.reduce(
    (sum, day) => ({ paise: sum.paise + day[kind].paise, count: sum.count + day[kind].count }),
    { paise: 0, count: 0 },
  );
  return (
    <View style={styles.kindTotal}>
      <Text style={styles.muted}>{`${DAY_KINDS[kind].label} this month`}</Text>
      <Amount paise={total.paise} direction={DAY_KINDS[kind].direction} size="xl" />
      <Text style={styles.muted}>{entriesText(total, kind)}</Text>
    </View>
  );
}

/** One day's totals that are not zero. */
function DayDetail({ day }) {
  const kinds = Object.keys(DAY_KINDS).filter((kind) => day[kind].paise > 0);
  return (
    <View style={styles.detail}>
      <Text style={styles.detailTitle}>{dayTitle(day.startMs)}</Text>
      {kinds.length === 0 ? <Text style={styles.muted}>Nothing on this day</Text> : null}
      {kinds.map((kind) => (
        <View key={kind} style={styles.detailLine}>
          <Text style={styles.detailLabel}>{DAY_KINDS[kind].label}</Text>
          <Text style={styles.detailCount}>{entriesText(day[kind], kind)}</Text>
          <Amount paise={day[kind].paise} direction={DAY_KINDS[kind].direction} />
        </View>
      ))}
    </View>
  );
}

/**
 * days: from getDailyTotals. kind: which total the cells show.
 * selected / onSelect: the tapped day's startMs.
 */
export function DayCalendar({ days, kind, selected, onSelect }) {
  const max = Math.max(1, ...days.map((day) => day[kind].paise));
  // Empty cells before the 1st, so it lands under its weekday.
  const blanks = new Date(days[0].startMs).getDay();
  const picked = days.find((day) => day.startMs === selected);
  return (
    <Card>
      <View style={styles.calendar}>
        {WEEKDAYS.map((name) => (
          <Text key={name} style={[styles.cell, styles.weekday]}>
            {name.slice(0, 1)}
          </Text>
        ))}
        {Array.from({ length: blanks }, (_, i) => (
          <View key={`blank-${i}`} style={styles.cell} />
        ))}
        {days.map((day) => {
          const share = day[kind].paise / max;
          // Dark cells get white text so it stays readable.
          const dark = share > 0.6;
          return (
            <Pressable
              key={day.startMs}
              accessibilityRole="button"
              accessibilityLabel={`${dayTitle(day.startMs)}: ${DAY_KINDS[kind].label} ${formatINRShort(day[kind].paise)}`}
              onPress={() => onSelect(day.startMs)}
              style={styles.cell}
            >
              <View
                style={[
                  styles.day,
                  day[kind].paise > 0 && { backgroundColor: `rgba(15, 118, 110, ${0.12 + share * 0.6})` },
                  day.startMs === selected && styles.picked,
                ]}
              >
                <Text style={[styles.dayNumber, dark && styles.onDark]}>{day.day}</Text>
                {day[kind].paise > 0 ? (
                  <Text style={[styles.dayAmount, dark && styles.onDark]} numberOfLines={1}>
                    {compactINR(day[kind].paise)}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
      {picked ? (
        <View style={styles.divider}>
          <DayDetail day={picked} />
        </View>
      ) : (
        <Text style={styles.tapHint}>Tap a day to see all its totals</Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  muted: { fontSize: fontSize.sm, color: colors.textMuted },
  kindTotal: { gap: 2 },
  calendar: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, padding: 2 },
  weekday: { textAlign: 'center', fontSize: fontSize.xs, color: colors.textMuted, paddingBottom: spacing.xs },
  day: {
    minHeight: 46,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  picked: { borderWidth: 2, borderColor: colors.text },
  dayNumber: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  dayAmount: { fontSize: 10, color: colors.text },
  onDark: { color: colors.onPrimary },
  tapHint: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', marginTop: spacing.md },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  detail: { paddingVertical: spacing.md, gap: spacing.xs },
  detailTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  detailLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  detailLabel: { width: 72, fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  detailCount: { fontSize: fontSize.sm, color: colors.textMuted },
});
