import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors } from '../constants/theme';

// Thin outline icons on a 24 x 24 grid, in the same style as the tab and
// category icons. Each entry draws with one colour: ICONS.date(color).
const STROKE = { fill: 'none', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' };

export const ICONS = {
  card: (c) => (
    <>
      <Rect x={3} y={6} width={18} height={12} rx={2} stroke={c} {...STROKE} />
      <Path d="M3 10h18M7 15h3" stroke={c} {...STROKE} />
    </>
  ),
  bank: (c) => <Path d="M4 10l8-5 8 5M5 10v8M19 10v8M9 10v8M15 10v8M3 20h18" stroke={c} {...STROKE} />,
  date: (c) => (
    <>
      <Rect x={4} y={5} width={16} height={15} rx={2} stroke={c} {...STROKE} />
      <Path d="M4 10h16M8 3v4M16 3v4" stroke={c} {...STROKE} />
    </>
  ),
  reference: (c) => <Path d="M9 4L7 20M17 4l-2 16M4 9h16M3 15h16" stroke={c} {...STROKE} />,
  notes: (c) => <Path d="M5 4h10l4 4v12H5zM8 12h8M8 16h5" stroke={c} {...STROKE} />,
  more: (c) => <Path d="M5 12h.01M12 12h.01M19 12h.01" stroke={c} {...STROKE} strokeWidth={3} />,
  filter: (c) => <Path d="M4 6h16M7 12h10M10 18h4" stroke={c} {...STROKE} strokeWidth={2} />,
  plus: (c) => <Path d="M12 5v14M5 12h14" stroke={c} {...STROKE} strokeWidth={2} />,
  // Sort and show choices in the Filters sheet.
  latest: (c) => (
    <>
      <Circle cx={12} cy={12} r={9} stroke={c} {...STROKE} />
      <Path d="M12 7v5l3 2" stroke={c} {...STROKE} />
    </>
  ),
  oldest: (c) => <Path d="M3.5 12a8.5 8.5 0 1 0 2.5-6L3.5 8.5M3.5 4v4.5H8M12 8v4l3 2" stroke={c} {...STROKE} />,
  largest: (c) => <Path d="M7 4v16M4 17l3 3 3-3M13 6h7M13 11h5M13 16h3" stroke={c} {...STROKE} />,
  people: (c) => (
    <>
      <Circle cx={9} cy={8} r={3} stroke={c} {...STROKE} />
      <Path d="M3 20a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6M18 14.5a6 6 0 0 1 3 5.5" stroke={c} {...STROKE} />
    </>
  ),
  settled: (c) => (
    <>
      <Circle cx={12} cy={12} r={9} stroke={c} {...STROKE} />
      <Path d="M8 12.5l2.7 2.7L16 9.5" stroke={c} {...STROKE} />
    </>
  ),
};

/** One icon per payment method (UPI, Cash, Card, Other). */
export const METHOD_ICONS = {
  UPI: (c) => <Path d="M13 3L5 14h6l-1 7 8-11h-6l1-7z" stroke={c} {...STROKE} />,
  Cash: (c) => (
    <>
      <Rect x={3} y={6} width={18} height={12} rx={2} stroke={c} {...STROKE} />
      <Path d="M9 9.5h6M9 12h6M11 9.5c2 0 2 2.5 0 2.5l3 3" stroke={c} {...STROKE} />
    </>
  ),
  Card: ICONS.card,
  Other: ICONS.more,
};

/** Draws one of the icons above. */
export function OutlineIcon({ draw, color = colors.textMuted, size = 15 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      {draw(color)}
    </Svg>
  );
}
