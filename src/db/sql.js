// SQL pieces shared by several queries. They are fixed text only: values
// always go in separately as ? parameters, never pasted into the SQL.
// All of them expect the transactions table to be named `t`.

/** "?, ?, ?" for an IN (...) list of `count` values. */
export function placeholders(count) {
  return Array(count).fill('?').join(', ');
}

/** Paying a shop account is never spending: the items taken already were. */
export const NOT_SHOP_PAYMENT = "t.shop_entry IS NOT 'payment'";

/** Spending: money paid that is not money given or taken, and not a shop payment. */
export const IS_SPENDING = `t.direction = 'debit' AND t.loan_type IS NULL AND ${NOT_SHOP_PAYMENT}`;

/** Money received that is income (not money given or taken). */
export const IS_INCOME = "t.direction = 'credit' AND t.loan_type IS NULL";

/** An expense that still needs a purpose. Money in, money given or taken, and shop items need none. */
export const NEEDS_PURPOSE =
  "t.purpose IS NULL AND t.direction = 'debit' AND t.loan_type IS NULL AND t.shop_entry IS NULL";

/** Money given or taken with this person: names match without case and outer spaces. */
export const SAME_PERSON = 't.loan_type IS NOT NULL AND lower(trim(t.merchant)) = lower(trim(?))';
