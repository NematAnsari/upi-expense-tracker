# Smart UPI Expense Tracker: Project Overview for Review

This document describes what has been built, how it works, and where a reviewer should look closely.
It reflects the code as of 31 Oct 2026. Personal data, account identifiers and project IDs are left out on purpose.

## 1. What the app is

An offline-first **Android** app for one person to track money paid and received in India.

- Add transactions by hand in a few taps (remembered names, purposes and templates).
- Or let the app **detect payments from bank SMS and UPI app notifications**, then review and add them with one tap.
- Track **money lent and borrowed** per person, kept out of spending and income totals.
- See monthly totals, spending by category and by week, and a comparison with last month.
- All data stays on the phone in SQLite. There is no server, no account and no upload.

## 2. Status by phase

| Phase | Scope | Status |
| --- | --- | --- |
| 1. Basic app | Add, edit, delete, list, monthly totals, categories, reports | Done, verified on device |
| 2. Faster entry | Name and purpose suggestions, templates, custom categories, "missing purpose" filter | Done, verified on device |
| 3. UPI detection | Notification listener, parser, review list, bank accounts, income, duplicates, undo | Done, verified on device for Kotak credit and BOI debit/credit |
| Extra | Loans (lent/borrowed/repaid), 39 Indian banks, UI simplification, loan UX simplification | Done; latest loan UX not yet tested on device |
| 4. Import/export | CSV or statement import with preview, export | Postponed by the owner |
| 5. Backup | Optional backup | Not started |

## 3. Technology

| Area | Choice | Version |
| --- | --- | --- |
| Framework | React Native with Expo (managed, Continuous Native Generation) | Expo SDK 58 (`expo ~58.0.21`), React Native 0.88.1, React 19.3.0 |
| Language | JavaScript only (no TypeScript, by requirement) | |
| Navigation | Expo Router (file-based, routes in `src/app/`) | `expo-router ~58.0.28` |
| Database | `expo-sqlite` with `SQLiteProvider`, WAL mode, foreign keys on | `~58.0.14` |
| Styling | React Native `StyleSheet` with theme tokens in `src/constants/theme.js` | |
| Date/time input | `@react-native-community/datetimepicker` | 9.2.1 |
| Native code | Local Expo module in Kotlin (`modules/upi-notification-listener`), Expo Modules API | |
| Builds | EAS Build in the cloud (no Android Studio). Profiles: `development` (dev client APK), `preview` (standalone APK) | |
| Tests | Node built-in test runner and `node:sqlite`, through an adapter that mimics the expo-sqlite API | Node 22.13+ or 24.3+ |
| Code quality | ESLint (`eslint-config-expo`), Prettier (printWidth 120, single quotes, trailing commas) | |

Notes:

- `react-dom` is pinned to the same version as `react`, otherwise npm fails with ERESOLVE.
- Packages are installed with `npx expo install` so versions match the SDK. `npx expo-doctor` passes 20/20.
- Target is Android only. `app.json` still has template `ios` and `web` entries that are unused.

## 4. Folder structure

```
src/
  app/                 Screens (Expo Router). Every file is a route.
    _layout.js         Opens the database, runs migrations, sets up the Stack navigator.
    (tabs)/            Bottom tabs: Dashboard (index.js), History, Reports, More.
    transaction/       new.js (add) and [id].js (edit).
    review-payments.js Detected payments waiting for Add / Edit / Ignore.
    auto-detect.js     Notification access, battery and alert settings, recent bank messages.
    accounts.js        Rename bank accounts.
    loans.js           Who owes you and whom you owe.
    loan/[person].js   One person's loan balance and entries, with a pay-back button.
  components/          Reusable UI (Amount, TransactionRow, TransactionForm, DetectedPaymentCard, chips, cards...).
  constants/           Theme tokens, default categories, payment methods.
  db/                  All SQL, one file per area. migrations.js holds schema versions.
  domain/              Business rules with no UI or SQL: validation, SMS parsing, banks, loans, categorizing.
  hooks/               useFocusQuery (reload data when a screen gains focus), useAsyncValue.
  services/            detection.js: glue between the native listener and the database.
  ui/                  Toasts and confirmation dialogs.
  utils/               Money and date formatting, text masking, source app names.
modules/upi-notification-listener/   Kotlin native module (see section 8).
tests/                 Node tests for money, dates, parsing, banks, loans and all database logic.
```

## 5. Core conventions

- **Money is integer paise** everywhere (₹12.50 is `1250`). Never floats. Indian formatting (₹1,23,456.78) is done by a hand-written `formatINR`.
- **Direction**: `'debit'` means money paid (expense), `'credit'` means money received (income). Income is never counted as spending.
- **Colors**: money paid is always red, money received always green, through one `Amount` component and `amountColor()`.
- **Loans** (`loan_type`) are neither spending nor income. They are excluded from those totals and summed per person.
- **Dates** are stored as UTC milliseconds and shown in the phone's local time.
- **SQL** always uses `?` placeholders. Multi-step writes use `withExclusiveTransactionAsync`.
- **Schema changes** are appended as new migrations. Shipped migrations are never edited.

## 6. Data model (SQLite, schema version 4)

Migrations run in `SQLiteProvider` `onInit`, tracked with `PRAGMA user_version`. Each step runs in its own transaction.

| Table | Purpose | Key columns |
| --- | --- | --- |
| `categories` | Default and custom categories | `name` UNIQUE NOCASE, `is_default`, `sort_order` |
| `transactions` | Every saved payment | `amount_paise` (CHECK > 0), `direction` (debit/credit), `purpose`, `category_id`, `occurred_at`, `payment_method` (UPI/Cash/Card/Other), `merchant` (name), `reference` (UPI ref), `notes`, `source` (manual or detected), `account_id`, `loan_type` |
| `settings` | Key/value settings | |
| `templates` | Reusable quick-add entries (amount optional) | `name`, `amount_paise`, `category_id`, `use_count`, `last_used_at` |
| `accounts` | Bank accounts found in messages | `bank_name`, `last4` (UNIQUE together), `nickname` |
| `detected_payments` | One row per captured notification | `capture_id` UNIQUE, `source_package`, `raw_text`, parsed fields, `status` (pending/added/ignored/duplicate/unrecognized), `possible_duplicate`, `transaction_id` |

Version history: v1 base tables and 13 default categories; v2 templates; v3 accounts, detected payments, Income and Uncategorized categories; v4 `loan_type` (CHECK: lent, borrowed, lent_repaid, borrowed_repaid) and a Loans category.

## 7. Features in detail

### Dashboard (tab)
Month selector; totals card (Spent in red, Received in green, today's spending, count); a link when expenses are missing a purpose; a bar when payments wait for review; "+ Add transaction"; top 3 categories with a link to Reports; the latest 5 transactions.

### Add / Edit transaction
- Order: templates (Add only), Paid/Received toggle, **loan choice row** (Normal, or I lent money / I paid back for paid; I borrowed money / They paid me back for received), Amount, Name, Category (hidden for loans), Purpose.
- "More details" folds payment method, bank account, date and time, UPI reference and notes. If a hidden field has an error, it opens by itself.
- Suggestions for names and purposes come from past entries; picking one can fill an empty category.
- Validation (`domain/validation.js`): positive amount with at most 2 decimals, category required, a loan needs a person's name, and the loan type must match the direction.
- Double-tap protection on Save with a ref, not only state.

### History (tab)
Search (purpose or name, plain substring with `instr`, so `%` and `_` are not wildcards), month selector, All / Paid / Received, and one Filters panel (missing purpose, loans, all months, sort order, category, account). Tap to edit, long press to delete with confirmation.

### Reports (tab)
Spent and received totals, change against last month, expense count, average and highest, spending by category, spending by week.

### More (tab)
Links to Loans, Review payments, Auto-detect settings and Bank accounts.

### Loans
- Loans screen: totals (others owe you / you owe), buttons "I lent money" and "I borrowed money", and one row per person (owes you, you owe, or settled).
- People are matched by name, ignoring case and spaces at the ends (`GROUP BY lower(trim(merchant))`).
- Person screen: balance, one button that records the repayment with the name and remaining amount filled in, links to lend or borrow more, and all entries with that person.
- Balance: lent and borrowed_repaid add to what they owe you; borrowed and lent_repaid subtract.

### Payment detection and review
See section 8 for the pipeline. The Review screen groups items by day and shows one card per payment: name, signed amount, one details line, category, main button (Add expense / Add income / loan wording), and links for Edit, Ignore and More options (loan choice and the full bank message). "Add all" only adds items that are ready, asks first, and supports undo.

### Bank accounts
Created automatically from the bank name and last 4 digits in messages. The user can rename them.

## 8. Payment detection pipeline

1. **Android service** (`PaymentNotificationListenerService.kt`, a `NotificationListenerService`). It only runs after the user turns on Notification access. On Android 13+ the user must first allow "restricted settings" for sideloaded apps.
2. **Filter on the phone**: keeps a notification only if it has an amount (₹, Rs, INR, or a bare amount next to Dr/Cr wording) and a payment word (debited, credited, paid, received, Dr, Cr...). Messages with OTP wording are dropped. Truecaller mirrors are ignored. The app's own notifications are ignored.
3. **Full text**: reads conversation-style messages (`EXTRA_MESSAGES`), big text, text lines and plain text, so a whole SMS is captured, not just the preview.
4. **No repeats**: a fingerprint per message (package, title, message id or notification key, post time, text) is remembered (last 1000), so the same message is not captured twice.
5. **Private queue**: kept items wait in app-private SharedPreferences (max 500) until the app opens.
6. **Optional alert**: a "Payment detected" notification (needs `POST_NOTIFICATIONS`) opens the Review screen through the `upiexpensetracker://review-payments` link.
7. **Reconnect**: the service asks Android to rebind when disconnected, and the app asks again on every open. The app checks whether battery optimization is off and guides the user.
8. **Sync** (`src/db/detected.js`, called from `services/detection.js`): moves the queue into `detected_payments` in a transaction, then empties the native queue. A failure on one item leaves it queued for retry.
9. **Parsing** (`src/domain/paymentParser.js`): regex-based. Extracts direction, amount in paise, bank (`domain/banks.js`, 39 banks, longest match wins so "State Bank of India" does not match "Bank of India"), last 4 account digits, counterparty name (rejects words like "UPI ref", amounts and digits), and UPI reference. Supports "NAME paid you ₹X" (Google Pay), BOB "Dr./Cr." and SBI amounts without a currency sign. Unknown formats are kept as "unrecognized" so nothing is lost.
10. **Duplicates**: same UPI reference as a saved or detected payment is a duplicate. Without a reference, a similar amount, direction and time is flagged as a **possible** duplicate (never merged silently). Two different references are never duplicates. Possible duplicates ask for confirmation before adding.
11. **Category suggestion** (`domain/categorize.js`): the category last used for that name wins, then keyword rules, then Uncategorized. Received money defaults to Income.

Known source behavior: Google Pay posts no notification for money sent, but does for money received. Bank SMS (via Google Messages) is the main source.

## 9. Native module API (`modules/upi-notification-listener/index.js`)

`isAvailable`, `isPermissionGranted`, `reconnectListener`, `isBatteryUnrestricted`, `openPermissionSettings`, `openAppSettings`, `areRemindersEnabled`, `setRemindersEnabled`, `canShowReminders`, `supportsReminders`, `getCapturedNotifications`, `removeCapturedNotifications`, `clearCapturedNotifications`.

The JS side loads it with `requireOptionalNativeModule`, so the app still runs without it (for example in Expo Go), with detection turned off.

## 10. Privacy and security

- No bank passwords, UPI PINs, OTPs or full account numbers are stored. Only the last 4 digits of an account.
- No network calls for user data. Nothing leaves the phone.
- The listener service is protected by `BIND_NOTIFICATION_LISTENER_SERVICE`, so only Android can bind to it.
- "Share masked" on a captured message hides account numbers, UPI IDs and references. It cannot detect names, and the UI says so.
- Known gaps: the SQLite database is **not encrypted**; anyone who can unlock the phone can open the app and see the data. Uninstalling deletes everything, and there is no backup yet (Phase 5).

## 11. Testing

- `npm test` runs **74 tests**, all passing at the time of writing. They cover money parsing and formatting, dates (month and leap-year edges), masking, the payment parser (many bank formats), bank matching, migrations and upgrades from older versions, transactions, reports, templates, suggestions, detection sync, duplicates, undo, and loans.
- Tests use only made-up sample messages and data.
- `npm run check` runs lint, format check and tests. `npx expo export --platform android` confirms the bundle builds.
- There are no UI or end-to-end tests. Screens are tested by hand on a OnePlus phone (Android 13+).

## 12. Build and run

| Command | Result |
| --- | --- |
| `npm start` | Dev server for the development build |
| `npm run start:go` / `start:go:tunnel` | Try screens in Expo Go (separate empty database, no detection) |
| `npm run build:dev` | Cloud build of the development client APK |
| `npm run build:app` | Cloud build of the standalone APK (what the owner uses daily) |

New builds are installed over the old app as an update. Uninstalling first deletes the data.

## 13. Known limitations and open items

- Bank sender IDs and formats for most of the 39 banks are based on common published formats and are **not verified** with real messages. Kotak debit and BoB messages still need real samples.
- Parsing is regex-based and will miss new or unusual formats (they are kept as "unrecognized").
- Android OEM battery management can still stop the listener despite the reconnect logic.
- Loan people are matched by exact name (case-insensitive, ASCII only through SQLite `lower`). A typo creates a separate person.
- No dark mode (`userInterfaceStyle: light`). Accessibility labels exist on main controls but have not been audited.
- No crash reporting or analytics (by design, no network).
- `LICENSE` is still the Expo template's file and needs a decision.
- Import/export (Phase 4) and backup (Phase 5) are not built.

## 14. Suggested review focus

1. **Correctness of money handling**: paise conversion, rounding, totals that exclude loans and income where they should.
2. **Parser robustness** (`src/domain/paymentParser.js`, `src/domain/banks.js`): false positives (OTP, offers, balance alerts) and false negatives.
3. **Duplicate logic** (`src/db/detected.js`): could a real payment be marked duplicate, or a duplicate slip through?
4. **Native service** (`PaymentNotificationListenerService.kt`, `CapturedNotificationStore.kt`): thread safety of SharedPreferences writes, fingerprint design, behavior when the app is killed.
5. **Migrations** (`src/db/migrations.js`): safety of upgrades on a phone with existing data.
6. **Privacy**: anything that could leak personal or financial data (logs, shared text, notifications on the lock screen).
7. **UX**: whether the main flows (add, review, loans) are simple enough for daily use.
8. **Code quality**: readability, duplication, and whether the folder split (app / components / db / domain) is respected.
