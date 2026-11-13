// The Summary card on a person's screen: "₹2,000 of ₹59,000 back", a ring with
// the % that came back, and three short lines (since when, last money back, entries).

import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Card } from '../basics/Card';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { formatShortDate } from '../../utils/dates';
import { formatINR } from '../../utils/money';
import { plural } from '../../utils/text';
import { PersonIcon } from './PersonIcon';

const RING_SIZE = 80;
const RING_STROKE = 8;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;
const RING_MIDDLE = RING_SIZE / 2;

export function PersonSummaryCard({ summary }) {
  const percent = `${Math.round(summary.share * 100)}%`;
  const facts = [
    summary.firstAt ? { icon: 'first', text: `Since ${formatShortDate(summary.firstAt)}` } : null,
    {
      icon: 'back',
      text: summary.lastBackAt ? `Last back ${formatShortDate(summary.lastBackAt)}` : 'Nothing back yet',
    },
    { icon: 'count', text: plural(summary.count, 'entry', 'entries') },
  ].filter(Boolean);
  return (
    <Card title="Summary">
      <Text style={styles.summaryLine}>{`${formatINR(summary.back)} of ${formatINR(summary.total)} back`}</Text>
      <View style={styles.ringRow}>
        <View style={styles.ring} accessible accessibilityLabel={`${percent} back`}>
          <Svg width={RING_SIZE} height={RING_SIZE} accessible={false}>
            <Circle
              cx={RING_MIDDLE}
              cy={RING_MIDDLE}
              r={RING_RADIUS}
              stroke={colors.background}
              strokeWidth={RING_STROKE}
              fill="none"
            />
            {summary.share > 0 ? (
              <Circle
                cx={RING_MIDDLE}
                cy={RING_MIDDLE}
                r={RING_RADIUS}
                stroke={colors.income}
                strokeWidth={RING_STROKE}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${RING_LENGTH * summary.share} ${RING_LENGTH}`}
                rotation={-90}
                origin={`${RING_MIDDLE}, ${RING_MIDDLE}`}
              />
            ) : null}
          </Svg>
          <View style={styles.ringCenter}>
            <Text style={styles.ringPercent}>{percent}</Text>
            <Text style={styles.ringCaption}>back</Text>
          </View>
        </View>
        <View style={styles.facts}>
          {facts.map((fact) => (
            <View key={fact.icon} style={styles.fact}>
              <View style={styles.factIcon}>
                <PersonIcon name={fact.icon} />
              </View>
              <Text style={styles.factText}>{fact.text}</Text>
            </View>
          ))}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  summaryLine: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  ringRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginTop: spacing.md },
  ring: { width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' },
  ringCenter: { position: 'absolute', alignItems: 'center' },
  ringPercent: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  ringCaption: { fontSize: fontSize.xs, color: colors.textMuted },
  facts: { flex: 1, gap: spacing.sm },
  fact: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  factIcon: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  factText: { fontSize: fontSize.sm, color: colors.text },
});
