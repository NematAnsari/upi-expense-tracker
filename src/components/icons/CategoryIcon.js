import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors, radius, spacing } from '../../constants/theme';
import { line } from './icons';

// Thin outline icons for categories, on a 24 x 24 grid, drawn like the other icons.
const LINE_WIDTH = 1.7;

const ICONS = {
  'Food & Dining': (c) => (
    <>
      <Path d="M6 3v4a2 2 0 0 0 4 0V3M8 9v12" {...line(c, LINE_WIDTH)} />
      <Path d="M17 21V3c2 1.5 3 4 3 7h-3" {...line(c, LINE_WIDTH)} />
    </>
  ),
  Groceries: (c) => (
    <>
      <Path d="M3 4h2l2.4 10.5h9.8L19.5 7H6" {...line(c, LINE_WIDTH)} />
      <Circle cx={9} cy={19} r={1.4} fill={c} />
      <Circle cx={17} cy={19} r={1.4} fill={c} />
    </>
  ),
  'Petrol & Transport': (c) => (
    <>
      <Rect x={4} y={4} width={9} height={16} rx={1.5} {...line(c, LINE_WIDTH)} />
      <Path d="M4 10h9M13 8l3 3v5.5a1.5 1.5 0 0 0 3 0V9l-2-2" {...line(c, LINE_WIDTH)} />
    </>
  ),
  Shopping: (c) => <Path d="M6 8h12l-1 12H7L6 8zM9 8a3 3 0 0 1 6 0" {...line(c, LINE_WIDTH)} />,
  'Bills & Utilities': (c) => <Path d="M13 3L5 14h6l-1 7 8-11h-6l1-7z" {...line(c, LINE_WIDTH)} />,
  Rent: (c) => <Path d="M4 11l8-7 8 7M6 9.5V20h12V9.5M10 20v-5h4v5" {...line(c, LINE_WIDTH)} />,
  Health: (c) => (
    <Path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" {...line(c, LINE_WIDTH)} />
  ),
  Entertainment: (c) => (
    <>
      <Circle cx={12} cy={12} r={9} {...line(c, LINE_WIDTH)} />
      <Path d="M10 8.5l5 3.5-5 3.5z" {...line(c, LINE_WIDTH)} />
    </>
  ),
  Travel: (c) => (
    <>
      <Rect x={4} y={8} width={16} height={11} rx={2} {...line(c, LINE_WIDTH)} />
      <Path d="M9 8V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" {...line(c, LINE_WIDTH)} />
    </>
  ),
  Education: (c) => (
    <Path
      d="M4 5h5a3 3 0 0 1 3 3v11a2 2 0 0 0-2-2H4zM20 5h-5a3 3 0 0 0-3 3v11a2 2 0 0 1 2-2h6z"
      {...line(c, LINE_WIDTH)}
    />
  ),
  'Personal Care': (c) => (
    <>
      <Circle cx={12} cy={12} r={9} {...line(c, LINE_WIDTH)} />
      <Path d="M8.5 14a4.5 4.5 0 0 0 7 0" {...line(c, LINE_WIDTH)} />
      <Circle cx={9} cy={10} r={1} fill={c} />
      <Circle cx={15} cy={10} r={1} fill={c} />
    </>
  ),
  Transfers: (c) => <Path d="M5 8h13M15 5l3 3-3 3M19 16H6M9 13l-3 3 3 3" {...line(c, LINE_WIDTH)} />,
  Income: (c) => <Path d="M12 4v10M8 10l4 4 4-4M4 16v3h16v-3" {...line(c, LINE_WIDTH)} />,
};

// Your own categories, Other and Uncategorized: a tag.
const GENERAL = (c) => (
  <>
    <Path d="M3 12V4h8l10 10-8 8z" {...line(c, LINE_WIDTH)} />
    <Circle cx={7.5} cy={7.5} r={1.2} fill={c} />
  </>
);

/**
 * A category icon in a pale circle, with a small badge for paid (red ↗) or
 * received (green ↙) in the bottom-right corner. small: the 28 px size used
 * for choices (category row, Filters), with no badge. color: the icon color
 * (grey by default).
 */
export function CategoryIcon({ categoryName, direction, small = false, color = colors.textMuted }) {
  const draw = ICONS[categoryName] ?? GENERAL;
  const received = direction === 'credit';
  return (
    <View style={[styles.circle, small && styles.circleSmall]}>
      <Svg width={small ? 15 : 20} height={small ? 15 : 20} viewBox="0 0 24 24" accessible={false}>
        {draw(color)}
      </Svg>
      {small ? null : (
        <View style={[styles.badge, { backgroundColor: received ? colors.income : colors.expense }]}>
          <Svg width={10} height={10} viewBox="0 0 24 24" accessible={false}>
            <Path d={received ? 'M17 7L7 17M15 17H7V9' : 'M7 17L17 7M9 7h8v8'} {...line(colors.onPrimary, 3.5)} />
          </Svg>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  circleSmall: {
    width: undefined,
    height: undefined,
    minWidth: 28,
    minHeight: 28,
    maxWidth: 36,
    maxHeight: 36,
    padding: spacing.xs,
  },
  badge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 16,
    height: 16,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
});
