// Seeded into the database on first launch. Changing this list later will not
// rename existing rows; add a migration in src/db/migrations.js for that.
export const DEFAULT_CATEGORIES = [
  'Food & Dining',
  'Groceries',
  'Petrol & Transport',
  'Shopping',
  'Bills & Utilities',
  'Rent',
  'Health',
  'Entertainment',
  'Travel',
  'Education',
  'Personal Care',
  'Transfers',
  'Other',
];

export const PAYMENT_METHODS = ['UPI', 'Cash', 'Card', 'Other'];

export const DEFAULT_PAYMENT_METHOD = 'UPI';
