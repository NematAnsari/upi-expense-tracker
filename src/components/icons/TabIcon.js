import Svg, { Circle, Path, Rect } from 'react-native-svg';

// Thin outline icons for the bottom tabs, drawn on a 24 x 24 grid.
// One stroke width and rounded line ends everywhere, so all four look alike.
const STROKE = {
  fill: 'none',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

const ICONS = {
  // A wallet: everyday money paid and received.
  expenses: (color) => (
    <>
      <Rect x={3} y={6} width={18} height={13} rx={2.5} stroke={color} {...STROKE} />
      <Path d="M3 10h18" stroke={color} {...STROKE} />
      <Circle cx={16.5} cy={14.5} r={1.2} fill={color} />
    </>
  ),
  // Two arrows passing each other: money given and money taken.
  givenTaken: (color) => (
    <>
      <Path d="M5 8h13M15 5l3 3-3 3" stroke={color} {...STROKE} />
      <Path d="M19 16H6M9 13l-3 3 3 3" stroke={color} {...STROKE} />
    </>
  ),
  // A bar chart: reports.
  reports: (color) => (
    <>
      <Path d="M3.5 20h17" stroke={color} {...STROKE} />
      <Path d="M7 16.5V11M12 16.5V6M17 16.5v-4" stroke={color} {...STROKE} strokeWidth={2.4} />
    </>
  ),
  // Three dots: more screens.
  more: (color) => (
    <>
      <Circle cx={5} cy={12} r={1.7} fill={color} />
      <Circle cx={12} cy={12} r={1.7} fill={color} />
      <Circle cx={19} cy={12} r={1.7} fill={color} />
    </>
  ),
};

/** A bottom tab icon. name: 'expenses' | 'givenTaken' | 'reports' | 'more'. */
export function TabIcon({ name, color, size = 24 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      {ICONS[name](color)}
    </Svg>
  );
}
