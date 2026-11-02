import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { chartColors, chartOtherColor, colors, fontSize } from '../constants/theme';
import { formatINR, percentOf } from '../utils/money';

const SIZE = 136;
const STROKE = 16;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
// White space between two slices, so neighbouring colours never touch.
const GAP = 2;

/** "34%", or "<1%" for a sliver, so the numbers read at a glance. */
export function shortPercent(percent) {
  return percent > 0 && percent < 1 ? '<1%' : `${Math.round(percent)}%`;
}

/**
 * The ring's slices: the five biggest categories in chartColors order, then
 * everything else folded into one grey "Other categories" slice.
 * categories: [{ categoryId, categoryName, totalPaise }] largest first.
 * Returns [{ key, name, totalPaise, percent, color, categoryId }].
 */
export function ringSlices(categories) {
  const total = categories.reduce((sum, category) => sum + category.totalPaise, 0);
  const top = categories.slice(0, chartColors.length).map((category, index) => ({
    key: String(category.categoryId),
    categoryId: category.categoryId,
    name: category.categoryName,
    totalPaise: category.totalPaise,
    percent: percentOf(category.totalPaise, total),
    color: chartColors[index],
  }));
  const restPaise = categories.slice(chartColors.length).reduce((sum, category) => sum + category.totalPaise, 0);
  if (restPaise > 0) {
    top.push({
      key: 'other',
      categoryId: null,
      name: 'Other categories',
      totalPaise: restPaise,
      percent: percentOf(restPaise, total),
      color: chartOtherColor,
    });
  }
  return top;
}

/**
 * A ring of spending by category with the month's total in the middle:
 *      .--.
 *    / ₹12,400 \
 *    \  spent  /
 *      '--'
 * slices: from ringSlices. totalPaise: shown in the middle.
 */
export function CategoryRing({ slices, totalPaise }) {
  const total = slices.reduce((sum, slice) => sum + slice.totalPaise, 0);
  const fulls = slices.map((slice) => (total > 0 ? (slice.totalPaise / total) * CIRCUMFERENCE : 0));
  const arcs = slices.map((slice, index) => ({
    key: slice.key,
    color: slice.color,
    // One slice alone is a closed ring with no gap.
    length: slices.length > 1 ? Math.max(fulls[index] - GAP, 0.5) : fulls[index],
    // Where this slice starts: the length of all slices before it.
    offset: fulls.slice(0, index).reduce((sum, full) => sum + full, 0),
  }));

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityLabel={`${formatINR(totalPaise)} spent. ${slices.map((slice) => `${slice.name} ${shortPercent(slice.percent)}`).join(', ')}`}
    >
      <Svg width={SIZE} height={SIZE} accessible={false}>
        <Circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} stroke={colors.background} strokeWidth={STROKE} fill="none" />
        {arcs.map((arc) => (
          <Circle
            key={arc.key}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke={arc.color}
            strokeWidth={STROKE}
            fill="none"
            strokeDasharray={`${arc.length} ${CIRCUMFERENCE - arc.length}`}
            strokeDashoffset={-arc.offset}
            // Start at the top and go clockwise.
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        ))}
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <Text style={styles.total} numberOfLines={1} adjustsFontSizeToFit>
          {formatINR(totalPaise)}
        </Text>
        <Text style={styles.caption}>spent</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: SIZE, height: SIZE },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: STROKE + 8,
  },
  total: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  caption: { fontSize: fontSize.xs, color: colors.textMuted },
});
