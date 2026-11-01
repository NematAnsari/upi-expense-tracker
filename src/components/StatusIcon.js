import { StyleSheet, View } from 'react-native';
import { colors, radius } from '../constants/theme';

// Drawn with plain views (no icon font): a clock for pending, a tick for settled.
// Amber means still pending, green means settled. Screen readers hear the word.
export const STATUS_COLORS = {
  pending: colors.warning,
  settled: colors.success,
};

const LOOK = {
  pending: { color: colors.warning, soft: colors.warningSoft, label: 'Pending' },
  settled: { color: colors.success, soft: colors.incomeSoft, label: 'Settled' },
};

function Clock({ color }) {
  return (
    <View style={[styles.clockFace, { borderColor: color }]}>
      <View style={[styles.hourHand, { backgroundColor: color }]} />
      <View style={[styles.minuteHand, { backgroundColor: color }]} />
    </View>
  );
}

function Tick({ color }) {
  return <View style={[styles.tick, { borderColor: color }]} />;
}

/** A round status icon. status: 'pending' or 'settled'. */
export function StatusIcon({ status }) {
  const look = LOOK[status];
  return (
    <View
      accessible
      accessibilityLabel={look.label}
      accessibilityRole="image"
      style={[styles.circle, { backgroundColor: look.soft }]}
    >
      {status === 'pending' ? <Clock color={look.color} /> : <Tick color={look.color} />}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // An 18 x 18 ring; its inside is 14 x 14 with the centre at (7, 7).
  clockFace: { width: 18, height: 18, borderRadius: 9, borderWidth: 2 },
  hourHand: { position: 'absolute', left: 6, top: 2, width: 2, height: 6, borderRadius: 1 },
  minuteHand: { position: 'absolute', left: 6, top: 6, width: 5, height: 2, borderRadius: 1 },
  // An L shape turned 45 degrees.
  tick: {
    width: 7,
    height: 13,
    marginTop: -3,
    borderRightWidth: 2.5,
    borderBottomWidth: 2.5,
    transform: [{ rotate: '45deg' }],
  },
});
