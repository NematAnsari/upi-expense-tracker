import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors } from '../../constants/theme';

// Thin outline icons on a 24 x 24 grid, in the same style as the tab and
// category icons. Each drawing takes a color and a line width:
// ICONS.date(color, 1.7). Draw one with <OutlineIcon draw={ICONS.date} />.

/** Line settings for a drawing; CategoryIcon uses them too. */
export const line = (color, width) => ({
  stroke: color,
  strokeWidth: width,
  fill: 'none',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
});

export const ICONS = {
  card: (c, w) => (
    <>
      <Rect x={3} y={6} width={18} height={12} rx={2} {...line(c, w)} />
      <Path d="M3 10h18M7 15h3" {...line(c, w)} />
    </>
  ),
  bank: (c, w) => <Path d="M4 10l8-5 8 5M5 10v8M19 10v8M9 10v8M15 10v8M3 20h18" {...line(c, w)} />,
  date: (c, w) => (
    <>
      <Rect x={4} y={5} width={16} height={15} rx={2} {...line(c, w)} />
      <Path d="M4 10h16M8 3v4M16 3v4" {...line(c, w)} />
    </>
  ),
  reference: (c, w) => <Path d="M9 4L7 20M17 4l-2 16M4 9h16M3 15h16" {...line(c, w)} />,
  notes: (c, w) => <Path d="M5 4h10l4 4v12H5zM8 12h8M8 16h5" {...line(c, w)} />,
  more: (c) => <Path d="M5 12h.01M12 12h.01M19 12h.01" {...line(c, 3)} />,
  filter: (c) => <Path d="M4 6h16M7 12h10M10 18h4" {...line(c, 2)} />,
  plus: (c) => <Path d="M12 5v14M5 12h14" {...line(c, 2)} />,
  // Sort and show choices in the Filters sheet.
  latest: (c, w) => (
    <>
      <Circle cx={12} cy={12} r={9} {...line(c, w)} />
      <Path d="M12 7v5l3 2" {...line(c, w)} />
    </>
  ),
  oldest: (c, w) => <Path d="M3.5 12a8.5 8.5 0 1 0 2.5-6L3.5 8.5M3.5 4v4.5H8M12 8v4l3 2" {...line(c, w)} />,
  largest: (c, w) => <Path d="M7 4v16M4 17l3 3 3-3M13 6h7M13 11h5M13 16h3" {...line(c, w)} />,
  people: (c, w) => (
    <>
      <Circle cx={9} cy={8} r={3} {...line(c, w)} />
      <Path d="M3 20a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6M18 14.5a6 6 0 0 1 3 5.5" {...line(c, w)} />
    </>
  ),
  settled: (c, w) => (
    <>
      <Circle cx={12} cy={12} r={9} {...line(c, w)} />
      <Path d="M8 12.5l2.7 2.7L16 9.5" {...line(c, w)} />
    </>
  ),
  // A message waiting to be looked at.
  envelope: (c, w) => <Path d="M4 6h16v12H4zM4 7l8 6 8-6" {...line(c, w)} />,
  bell: (c, w) => <Path d="M18 16v-5a6 6 0 1 0-12 0v5l-2 2h16l-2-2zM10 21h4" {...line(c, w)} />,
  // A cup with steam, for shop accounts.
  cup: (c, w) => (
    <Path d="M5 8h11v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V8zM16 9h1.5a2.5 2.5 0 0 1 0 5H16M8 3v2M12 3v2" {...line(c, w)} />
  ),
  // A tray with a down arrow, for backups.
  download: (c, w) => <Path d="M12 4v10M8 10l4 4 4-4M5 19h14" {...line(c, w)} />,
  lock: (c, w) => (
    <>
      <Rect x={5} y={10.5} width={14} height={10} rx={2} {...line(c, w)} />
      <Path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" {...line(c, w)} />
    </>
  ),
  pencil: (c, w) => <Path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" {...line(c, w)} />,
  back: (c, w) => <Path d="M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" {...line(c, w)} />,
  clock: (c, w) => <Path d="M12 7v5l3 2M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9z" {...line(c, w)} />,
  tick: (c) => <Path d="M5 12.5l4.5 4.5L19 7.5" {...line(c, 2.6)} />,
};

/** One icon per payment method (UPI, Cash, Card, Other). */
export const METHOD_ICONS = {
  UPI: (c, w) => <Path d="M13 3L5 14h6l-1 7 8-11h-6l1-7z" {...line(c, w)} />,
  Cash: (c, w) => (
    <>
      <Rect x={3} y={6} width={18} height={12} rx={2} {...line(c, w)} />
      <Path d="M9 9.5h6M9 12h6M11 9.5c2 0 2 2.5 0 2.5l3 3" {...line(c, w)} />
    </>
  ),
  Card: ICONS.card,
  Other: ICONS.more,
};

/** Draws one icon. strokeWidth: line thickness (most of the app uses 1.7). */
export function OutlineIcon({ draw, color = colors.textMuted, size = 15, strokeWidth = 1.7 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      {draw(color, strokeWidth)}
    </Svg>
  );
}
