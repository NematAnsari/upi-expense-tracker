// The small outline icons on a person's screen, a little bolder than most.

import { ICONS, OutlineIcon } from '../icons/icons';
import { colors } from '../../constants/theme';

const PERSON_ICONS = {
  first: ICONS.date,
  back: ICONS.back,
  count: ICONS.reference,
  clock: ICONS.clock,
  tick: ICONS.tick,
  pencil: ICONS.pencil,
};

export function PersonIcon({ name, size = 14, color = colors.textMuted }) {
  return <OutlineIcon draw={PERSON_ICONS[name]} color={color} size={size} strokeWidth={1.8} />;
}
