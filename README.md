# Smart UPI Expense Tracker

An offline-first Android app for tracking money paid and received.

- Add transactions by hand in a few taps, with remembered names, purposes and templates.
- Or let the app detect payments from bank SMS and UPI app notifications, then review and add them with one tap.
- See monthly totals, spending by category and week, and a comparison with last month.
- All data stays on the phone (SQLite). The app has no server and uploads nothing.

Built with React Native, Expo (SDK 58) and Expo Router, in JavaScript.

## Requirements

| Tool          | Version                                                                   |
| ------------- | ------------------------------------------------------------------------- |
| Node.js       | 22.13+ or 24.3+ (see `.nvmrc`; with nvm: `nvm use`)                       |
| npm           | Comes with Node.js                                                        |
| Expo account  | Free, needed only for building the app (`npx eas-cli@latest login`)       |
| Android phone | Any recent Android phone. No USB cable needed: builds install from a link |

Android Studio is **not** needed. Builds run in the cloud with EAS Build.

## Getting started

```bash
npm install
npx expo start
```

Then open the **Expense Tracker** app on your phone (the development build) and scan the QR code.
If the phone cannot connect, use `npx expo start --tunnel`.

> Expo Go can run most screens, but payment detection only works in this app's own build,
> because it uses custom Android code.

## Builds

| Command             | What you get                                                         | Needs the PC running |
| ------------------- | -------------------------------------------------------------------- | -------------------- |
| `npm run build:dev` | Development build: loads code from your PC, changes appear instantly | Yes                  |
| `npm run build:app` | Standalone app (APK): everything inside, works like a normal app     | No                   |

A new build is only needed when **native** code changes: files in `modules/`, packages with native code, or
`app.json` plugins and permissions. JavaScript changes reload instantly in the development build.

Installing a new build: open the download link on the phone and tap **Update**.
**Do not uninstall the old app first**: that deletes all saved transactions.

## Commands

```bash
npm start              # start the dev server
npm test               # run all tests (Node, no phone needed)
npm run lint           # check code for problems
npm run format         # format all code with Prettier
npm run check          # lint + format check + tests (run before committing)
npx expo-doctor        # check package versions match the Expo SDK
```

## Folder structure

```
src/
  app/            Screens. Expo Router turns each file into a route (history.js -> /history).
    (tabs)/       The bottom tabs: Dashboard (index.js), History, Reports.
    transaction/  Add (new.js) and Edit ([id].js) a transaction.
    review-payments.js   Payments detected from bank SMS, waiting for Add or Ignore.
    auto-detect.js       Notification access, battery and alert settings.
    accounts.js          Rename bank accounts.
    _layout.js    Opens the database, runs migrations, sets up navigation.
  components/     Reusable UI pieces (Amount, TransactionRow, TransactionForm, cards, chips...).
  constants/      Theme (colours, spacing, font sizes) and fixed lists (default categories).
  db/             All SQL. One file per area (transactions, reports, detected payments...).
                  migrations.js upgrades the database schema without losing data.
  domain/         Business rules with no UI or SQL: validation, bank SMS parsing,
                  category suggestions, form helpers.
  hooks/          Small React hooks for loading data.
  services/       Glue between the native notification listener and the database.
  ui/             Pop-up helpers: toasts and confirmation dialogs.
  utils/          Plain helpers: money and date formatting, masking, app names.
modules/
  upi-notification-listener/   Local native Android module (Kotlin): reads payment notifications,
                               shows the "Payment detected" alert, checks battery settings.
tests/            Node tests for money, dates, parsing and all database logic.
```

## Conventions

- **Money** is stored and calculated as whole paise (integers): ₹12.50 is `1250`. Never use decimals for money.
- **Colours for amounts**: money paid is always red, money received is always green. Use the `Amount` component
  (or `amountColor()` from the theme) for every amount shown on screen.
- **Direction**: `'debit'` = money paid (an expense), `'credit'` = money received (income).
  Income is never counted as spending.
- **Loans** (`loan_type`: lent, borrowed, lent_repaid, borrowed_repaid) are not spending or income. They are left
  out of those totals and summed per person on the Loans screen (matched by name, ignoring case).
- **Dates** are stored as UTC milliseconds and shown in the phone's local time.
- **SQL** always uses `?` placeholders, never string concatenation.
- **Database changes** go in a new migration at the end of `src/db/migrations.js`. Never edit a shipped one.
- **Formatting** is done by Prettier (`npm run format`); settings are in `.prettierrc.json`.

## How payment detection works

1. With your permission (Settings > Notification access), the app's Android service sees new notifications.
2. It keeps only ones that look like payments: an amount (₹, Rs, INR) plus words like debited, credited or paid.
   OTPs are never kept. Truecaller copies of bank SMS are skipped.
3. Kept messages wait in private app storage until the app opens, then move into the database.
4. Each one is read for amount, paid/received, bank, last 4 account digits, name and UPI reference.
   Unknown formats are kept as "Not a payment message" so nothing is lost.
5. You review them: **Add**, **Edit** or **Ignore**. Same UPI reference = duplicate. Similar payments
   without a reference are flagged as possible duplicates, never merged silently.

Limits: Google Pay does not notify for money you send (the bank SMS covers it). If a bank sends no SMS and
no app notification, the payment cannot be detected; add it by hand.

## Privacy and security

- Data is stored only on the phone, in the app's private storage. Uninstalling the app deletes it.
- No bank passwords, UPI PINs, OTPs or full account numbers are ever stored (only the last 4 digits).
- The "Share masked" button hides account numbers, UPI IDs and references, but cannot detect names:
  always check before sharing.
- The database is not encrypted. Anyone who can unlock the phone and open the app can see the data.
- Test files use made-up sample messages only.
