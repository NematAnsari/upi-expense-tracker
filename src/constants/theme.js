// One place for colours and sizes, so every screen looks the same.

export const colors = {
  background: '#F4F6F8',
  surface: '#FFFFFF',
  text: '#111827',
  textMuted: '#6B7280',
  border: '#E5E7EB',

  // Brand colour for buttons, links and selected chips.
  primary: '#0F766E',
  primarySoft: '#E6F4F2',
  onPrimary: '#FFFFFF',
  // Brand colour that stays readable on a dark background (the Undo bar).
  primaryOnDark: '#7DD3C0',

  // Money. Always use these (or the Amount component) for amounts:
  // money paid is red, money received is green, everywhere in the app.
  expense: '#C62828',
  expenseSoft: '#FDECEA',
  income: '#2E7D32',
  incomeSoft: '#E8F5E9',

  // Status messages (e.g. "Notification access is ON") and errors/destructive
  // actions such as delete. Not for amounts.
  success: '#15803D',
  danger: '#B91C1C',
  dangerSoft: '#FDECEC',
  warning: '#B45309',
  warningSoft: '#FEF3C7',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
};

export const radius = {
  sm: 8,
  md: 12,
  pill: 999,
};

export const fontSize = {
  sm: 13,
  md: 15,
  lg: 17,
  xl: 22,
  xxl: 30,
};

/** Text colour for an amount: red for money paid, green for money received. */
export function amountColor(direction) {
  return direction === 'credit' ? colors.income : colors.expense;
}
