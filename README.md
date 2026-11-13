# Smart UPI Expense Tracker

An offline-first Android app for tracking money paid and received.

- Add transactions by hand in a few taps, with remembered names, purposes and templates.
- Or let the app detect payments from bank SMS and UPI app notifications, then review and add them with one tap.
- See monthly totals, spending by category and week, and a comparison with last month.
- All data stays on the phone (SQLite). The app has no server and uploads nothing.

Built with React Native, Expo (SDK 58) and Expo Router, in JavaScript.

**Full documentation** (every feature, the money rules, the database, known issues and a change log) is in
[docs/DOCUMENTATION.md](docs/DOCUMENTATION.md). It is updated together with every change to the app.

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
npm start
```

Then open **Expo Go** on your phone and type the `exp://...` address the command prints (the QR code does not
work with this project). Expo Go has its own empty database, so your real data is never touched.

> Expo Go can show most screens, but payment detection, App lock and the nightly backup only work in this app's
> own build, because they use native Android code. Use `npm run build` for that.

## Builds

`npm run build` makes the app you install and use (an APK, built in the cloud). Everything is inside it, so it
works like a normal app without the PC.

A new build is only needed when **native** code changes: files in `modules/`, packages with native code, or
`app.json` plugins and permissions. To see JavaScript changes without a build, use `npm start` (Expo Go).

Installing a new build: open the download link on the phone and tap **Update**.
**Do not uninstall the old app first**: that deletes all saved transactions.

## Commands

```bash
npm start              # try the app in Expo Go (type the exp:// address it prints)
npm test               # run all tests (no phone needed)
npm run format         # tidy the code formatting
npm run check          # lint + format check + tests (run before committing)
npm run build          # build the app you install (install it with Update)
```

## Folder structure

```
src/
  app/            Screens. Expo Router turns each file into a route (history.js -> /history).
    (tabs)/       The bottom tabs: Expenses (index.js), Given & Taken (given-taken.js), Reports, More.
    history.js           All expenses and income, with search and filters (opened from Expenses and More).
    transaction/  Add (new.js) and Edit ([id].js) a transaction.
    review-payments.js   Payments detected from bank SMS, waiting for Add or Ignore.
    auto-detect.js       Notification access, battery and alert settings.
    accounts.js          Rename bank accounts.
    shops.js, shop/[id].js   Shop accounts (take now, pay later) and a shop's statement.
    backup.js            Save everything to a file and restore it.
    loan/[person].js     One person's totals, remaining amount and history, with a record-return button.
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
docs/             DOCUMENTATION.md, the complete reference for the app.
```

## Conventions

- **Money** is stored and calculated as whole paise (integers): ₹12.50 is `1250`. Never use decimals for money.
- **Colours for amounts**: money paid is always red, money received is always green. Use the `Amount` component
  (or `amountColor()` from the theme) for every amount shown on screen.
- **Direction**: `'debit'` = money paid (an expense), `'credit'` = money received (income).
  Income is never counted as spending.
- **Money given and taken** (`loan_type`: lent, borrowed, lent_repaid, borrowed_repaid) is not spending or income.
  It is left out of those totals and summed per person (matched by name, ignoring case). Money received back or
  returned cannot be more than the person's remaining amount (`checkReturnAmount` in `src/db/reports.js`).
- **On-screen words** for these come from `src/domain/loans.js`. The app never shows the words loan, lend, borrow,
  owe or repay; it says "I gave money", "I took money", "Money to receive", "Money to return" and so on.
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
