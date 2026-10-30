import { DEFAULT_CATEGORIES } from '../constants/categories.js';

export const DATABASE_NAME = 'expenses.db';

// Each entry upgrades the schema by one version. SQLite remembers the current
// version in `PRAGMA user_version`, so existing data is kept on upgrade.
// Never edit a migration that has already shipped. Append a new one instead.
export const MIGRATIONS = [
  // Version 1: initial schema.
  async (db) => {
    await db.execAsync(`
      CREATE TABLE categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        is_default INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
        direction TEXT NOT NULL DEFAULT 'debit' CHECK (direction IN ('debit', 'credit')),
        purpose TEXT,
        category_id INTEGER NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
        occurred_at INTEGER NOT NULL,
        payment_method TEXT NOT NULL CHECK (payment_method IN ('UPI', 'Cash', 'Card', 'Other')),
        merchant TEXT,
        reference TEXT,
        notes TEXT,
        source TEXT NOT NULL DEFAULT 'manual',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX idx_transactions_occurred_at ON transactions (occurred_at);
      CREATE INDEX idx_transactions_category_id ON transactions (category_id);

      CREATE TABLE settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT
      );
    `);

    const now = Date.now();
    for (const [index, name] of DEFAULT_CATEGORIES.entries()) {
      await db.runAsync('INSERT INTO categories (name, is_default, sort_order, created_at) VALUES (?, 1, ?, ?)', [
        name,
        index,
        now,
      ]);
    }
  },

  // Version 2: reusable expense templates. Amount is optional (e.g. petrol varies).
  async (db) => {
    await db.execAsync(`
      CREATE TABLE templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        amount_paise INTEGER CHECK (amount_paise IS NULL OR amount_paise > 0),
        category_id INTEGER NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
        purpose TEXT,
        merchant TEXT,
        payment_method TEXT NOT NULL CHECK (payment_method IN ('UPI', 'Cash', 'Card', 'Other')),
        use_count INTEGER NOT NULL DEFAULT 0,
        last_used_at INTEGER,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX idx_transactions_created_at ON transactions (created_at);
    `);
  },

  // Version 3: bank accounts and payments detected from notifications.
  async (db) => {
    await db.execAsync(`
      CREATE TABLE accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bank_name TEXT,
        last4 TEXT,
        nickname TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE (bank_name, last4)
      );

      ALTER TABLE transactions ADD COLUMN account_id INTEGER REFERENCES accounts (id) ON DELETE SET NULL;
      CREATE INDEX idx_transactions_reference ON transactions (reference);

      -- One row per captured notification. The raw text stays on the phone so
      -- you can check what was read. status: pending (waiting for you), added,
      -- ignored, duplicate (same UPI reference already saved) or unrecognized.
      CREATE TABLE detected_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        capture_id TEXT NOT NULL UNIQUE,
        source_package TEXT,
        title TEXT,
        raw_text TEXT NOT NULL,
        posted_at INTEGER NOT NULL,
        direction TEXT CHECK (direction IS NULL OR direction IN ('debit', 'credit')),
        amount_paise INTEGER,
        account_id INTEGER REFERENCES accounts (id) ON DELETE SET NULL,
        counterparty TEXT,
        reference TEXT,
        status TEXT NOT NULL CHECK (status IN ('pending', 'added', 'ignored', 'duplicate', 'unrecognized')),
        possible_duplicate INTEGER NOT NULL DEFAULT 0,
        transaction_id INTEGER REFERENCES transactions (id) ON DELETE SET NULL,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX idx_detected_status ON detected_payments (status);
      CREATE INDEX idx_detected_reference ON detected_payments (reference);
    `);

    // OR IGNORE: you may already have created a category with one of these names.
    for (const name of ['Income', 'Uncategorized']) {
      await db.runAsync(
        `INSERT OR IGNORE INTO categories (name, is_default, sort_order, created_at)
         VALUES (?, 1, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories), ?)`,
        [name, Date.now()],
      );
    }
  },

  // Version 4: money lent and borrowed. A loan is not spending or income, so
  // loan rows are left out of those totals and tracked per person instead.
  async (db) => {
    await db.execAsync(`
      ALTER TABLE transactions ADD COLUMN loan_type TEXT
        CHECK (loan_type IS NULL OR loan_type IN ('lent', 'borrowed', 'lent_repaid', 'borrowed_repaid'));
      CREATE INDEX idx_transactions_loan_type ON transactions (loan_type);
    `);
    await db.runAsync(
      `INSERT OR IGNORE INTO categories (name, is_default, sort_order, created_at)
       VALUES ('Loans', 1, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories), ?)`,
      [Date.now()],
    );
  },
];

export const LATEST_VERSION = MIGRATIONS.length;

/** Runs once when the app opens the database (see SQLiteProvider onInit). */
export async function migrateDbIfNeeded(db) {
  // Foreign key checks are off by default in SQLite and apply per connection.
  await db.execAsync('PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync('PRAGMA user_version');
  let version = row?.user_version ?? 0;

  if (version === 0) {
    // Write-ahead logging: faster writes and safer against crashes. Must run outside a transaction.
    await db.execAsync("PRAGMA journal_mode = 'wal';");
  }

  // Each step runs in a transaction: if it fails, nothing from that step is applied.
  while (version < MIGRATIONS.length) {
    const migrate = MIGRATIONS[version];
    const nextVersion = version + 1;
    await db.withExclusiveTransactionAsync(async (txn) => {
      await migrate(txn);
      await txn.execAsync(`PRAGMA user_version = ${nextVersion}`);
    });
    version = nextVersion;
  }
}
