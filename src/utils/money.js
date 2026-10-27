// All money is stored and calculated as whole paise (integers): ₹12.50 is 1250.
// Integers add exactly, so totals never drift the way 0.1 + 0.2 does with decimals.

// ₹1,00,00,000.00. Anything larger is almost certainly a typo.
export const MAX_AMOUNT_PAISE = 1000000000;

/**
 * Converts user input such as "1,250.5" into paise.
 * Returns { paise } on success or { error } with a message to show the user.
 */
export function parseAmountToPaise(input) {
  const cleaned = String(input ?? '').replace(/[\s,₹]/g, '');

  if (cleaned === '') {
    return { error: 'Enter an amount.' };
  }
  if (!/^(\d+(\.\d{0,2})?|\.\d{1,2})$/.test(cleaned)) {
    return { error: 'Enter a valid amount, like 250 or 99.50 (up to 2 decimal places).' };
  }

  const [rupeePart, paisePart = ''] = cleaned.split('.');
  if (rupeePart.length > 10) {
    return { error: 'That amount is too large.' };
  }

  const paise = Number(rupeePart || '0') * 100 + Number(paisePart.padEnd(2, '0'));

  if (paise <= 0) {
    return { error: 'Amount must be more than ₹0.' };
  }
  if (paise > MAX_AMOUNT_PAISE) {
    return { error: `Amount cannot be more than ${formatINR(MAX_AMOUNT_PAISE)}.` };
  }
  return { paise };
}

/** Turns paise back into an editable string: 125000 -> "1250", 9950 -> "99.50". */
export function paiseToInputString(paise) {
  const rupees = Math.floor(paise / 100);
  const remainder = paise % 100;
  return remainder === 0 ? String(rupees) : `${rupees}.${String(remainder).padStart(2, '0')}`;
}

// Indian digit grouping: 12345678 -> 1,23,45,678
function groupIndian(digits) {
  if (digits.length <= 3) {
    return digits;
  }
  const lastThree = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${lastThree}`;
}

/** Formats paise as Indian rupees: 125000 -> "₹1,250.00". */
export function formatINR(paise) {
  const value = Math.round(Number(paise) || 0);
  const sign = value < 0 ? '-' : '';
  const absolute = Math.abs(value);
  const rupees = groupIndian(String(Math.floor(absolute / 100)));
  const remainder = String(absolute % 100).padStart(2, '0');
  return `${sign}₹${rupees}.${remainder}`;
}

/** Average in whole paise, rounded to the nearest paisa. */
export function averagePaise(totalPaise, count) {
  return count > 0 ? Math.round(totalPaise / count) : 0;
}

/** Share of a total as a percentage number (0-100). Returns 0 when the total is 0. */
export function percentOf(part, total) {
  return total > 0 ? (part * 100) / total : 0;
}

export function formatPercent(value) {
  return `${value.toFixed(1)}%`;
}
