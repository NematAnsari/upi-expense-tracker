// Hides personal details in a notification's text so it is safer to share
// (for example, to help improve detection). Amounts are kept, because the
// format is what matters. Names cannot be detected reliably: always check
// the masked text yourself before sharing it.

const AMOUNT = /(₹|\bRs\.?|\bINR)\s*[\d,]+(\.\d{1,2})?/gi;
const UPI_ID = /[\w.-]+@[a-z][a-z0-9]*/gi;
const LONG_NUMBER = /\d{4,}/g;

export function maskSensitiveText(text) {
  const amounts = [];
  // Set amounts aside so their digits are not masked.
  const withoutAmounts = String(text ?? '').replace(AMOUNT, (match) => {
    amounts.push(match);
    return `\u0000${amounts.length - 1}\u0000`;
  });

  const masked = withoutAmounts
    .replace(UPI_ID, (match) => `xxxx@${match.split('@')[1]}`)
    .replace(LONG_NUMBER, (match) => 'X'.repeat(match.length));

  return masked.replace(/\u0000(\d+)\u0000/g, (_, index) => amounts[Number(index)]);
}
