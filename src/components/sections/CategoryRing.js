import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { chartColors, chartOtherColor, colors } from '../../constants/theme';
import { formatINR, percentOf } from '../../utils/money';

const RING_WIDTH = 18;
// White space between two slices, so neighboring colors never touch.
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
 * A ring of spending by category. Nothing is written inside it, so a large
 * total can never run into the ring; the screen shows the total above it.
 * slices: from ringSlices. totalPaise: read out by screen readers. size: width and height.
 */
export function CategoryRing({ slices, totalPaise, size = 168 }) {
  const ringRadius = (size - RING_WIDTH) / 2;
  const circumference = 2 * Math.PI * ringRadius;
  const center = size / 2;
  const total = slices.reduce((sum, slice) => sum + slice.totalPaise, 0);
  const sliceLengths = slices.map((slice) => (total > 0 ? (slice.totalPaise / total) * circumference : 0));
  const arcs = slices.map((slice, index) => ({
    key: slice.key,
    color: slice.color,
    // One slice alone is a closed ring with no gap.
    length: slices.length > 1 ? Math.max(sliceLengths[index] - GAP, 0.5) : sliceLengths[index],
    // Where this slice starts: the length of all slices before it.
    offset: sliceLengths.slice(0, index).reduce((sum, length) => sum + length, 0),
  }));

  return (
    <View
      style={{ width: size, height: size }}
      accessible
      accessibilityLabel={`${formatINR(totalPaise)} spent. ${slices.map((slice) => `${slice.name} ${shortPercent(slice.percent)}`).join(', ')}`}
    >
      <Svg width={size} height={size} accessible={false}>
        <Circle
          cx={center}
          cy={center}
          r={ringRadius}
          stroke={colors.background}
          strokeWidth={RING_WIDTH}
          fill="none"
        />
        {arcs.map((arc) => (
          <Circle
            key={arc.key}
            cx={center}
            cy={center}
            r={ringRadius}
            stroke={arc.color}
            strokeWidth={RING_WIDTH}
            fill="none"
            strokeDasharray={`${arc.length} ${circumference - arc.length}`}
            strokeDashoffset={-arc.offset}
            // Start at the top and go clockwise.
            transform={`rotate(-90 ${center} ${center})`}
          />
        ))}
      </Svg>
    </View>
  );
}
