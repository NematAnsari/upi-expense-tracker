# Smart UPI Expense Tracker: Documentation

The complete reference for what the app does, how it is built and the rules it follows.
Everything about the app is defined here. When the app changes, this file changes too (see section 1).

| | |
| --- | --- |
| Last updated | 2026-11-11 |
| Database schema version | 6 |
| Automated tests | 113, all passing |
| Platform | Android only |
| Personal data | Not included here on purpose: no names, account numbers, project IDs or real messages |

## 1. Keeping this document up to date

This file is the single source of truth. Update it **in the same change** as the code, not later.

| If you change... | Update these sections |
| --- | --- |
| A screen, button, label or flow | 4 (Features) and, if it affects counting, 5 (Money rules) |
| On-screen wording | 2 (Wording rules) and the section that shows it |
| The database (any new migration) | 6 (Data model), the version in the table above, and 10 if backup is affected |
| A package, command or build step | 7 (Technology) and 12 (Build and run) |
| Payment detection, parsing or the native module | 8 and 9 |
| Tests (count or new files) | 11 and the count in the table above |
| A bug is found or fixed | 13 (Known issues) |
| A feature is added, removed or changed on purpose | 14 (Decisions) and 15 (Change log) |

Every update also adds one line to the change log (section 15) and refreshes "Last updated" above.
Do not leave a removed feature described anywhere in this file.

## 2. What the app is

An offline-first Android app for one person to track money in India.

- Add expenses and income by hand in a few taps, with remembered names, purposes and templates.
- Let the app **detect payments from bank SMS and UPI app notifications**, then review and add them with one tap.
- Track **money given to and taken from people**, kept apart from spending and income.
- Keep a running account with a **shop where you take now and pay later** (for example tea paid monthly).
- See monthly totals, spending by category and a comparison with last month.
- **Back up** everything to a file and restore it.
- All data stays on the phone in SQLite. There is no server, no account and no upload.

## 3. Wording rules

The app never shows the words loan, lend, borrow, owe or repay. The internal names (`loan_type`, `lent`...) are unchanged; only what the screen says follows these rules. The source of the wording is `src/domain/loans.js`.

| Use | Instead of |
| --- | --- |
| I gave money, I took money | lend, borrow |
| Money to receive, Money to return | owed to you, you owe |
| Money received back, Money returned | repaid |
| Remaining amount, Fully settled | outstanding, cleared |

Amounts are always colored: money paid is **red**, money received is **green**. This comes from one `Amount` component and `amountColor()` in the theme. Colors for other meaning (teal for actions, amber for warnings) are never used on amounts.

## 4. Features

### 4.1 Screens at a glance

| Where | Screen | What it is for |
| --- | --- | --- |
| Tab | **Expenses** | This month's spending and income, to-do reminders, shop accounts, the list |
| Tab | **Given & Taken** | People you gave money to or took money from |
| Tab | **Reports** | One month at a glance: total, ring chart by category |
| Tab | **More** | Review payments and the less frequent screens |
| Opened from tabs | Add / Edit transaction | The form (`transaction/new.js`, `transaction/[id].js`) |
| Opened from tabs | History | Every expense and income entry, any month, with filters |
| Opened from tabs | Person page | One person's balance and statement (`loan/[person].js`) |
| Opened from More | Review payments | Detected payments waiting for Add or Ignore |
| Opened from More | Payment detection | Notification access, battery and alert settings, recent bank messages |
| Opened from More | Bank accounts | Rename accounts found in bank SMS, add your own |
| Opened from More | Shop accounts, Statement | Take now, pay later accounts (`shops.js`, `shop/[id].js`) |
| Opened from More | Backup & restore | Save everything to a file, bring it back (`backup.js`) |

The four tabs use thin outline icons with a small label below. The Given & Taken title bar has an info button that explains why those totals are kept apart.

### 4.2 Expenses tab

From top to bottom:

1. **Month selector** (see 4.12).
2. **Two tiles, Spent and Received.** Each shows the month's total, a small grey count pill, and a **+** to add. In the current month the last line is "Today ₹x" with a pill for today's count, or "Nothing today". Past months leave that line blank.
3. **To-do card** (only when something needs you): "Payments to review (N)" first, because those are not counted until added, then "Need a purpose (N)", which opens History filtered to expenses with no purpose.
4. **Shop account strips**, one per shop account (see 4.8).
5. **All / Paid / Received** switch with a count on each.
6. **Search** (shown from 6 entries, or while it has text so it can always be cleared; matches name or purpose) and a **Filters** button. Filters is a bottom sheet: Sort by (Latest, Largest), Category, Paid by, Bank account. When filters are on, a line shows the entry count with Spent and Received.
7. **The list**, one white card. Swipe a row right to edit, left to delete (with confirmation). Repeat purchases share a row (see 4.5). The list only draws the rows on screen, so a busy month stays smooth.
8. **View all in History**.

### 4.3 Add / Edit transaction

Order on the form:

1. **Templates** (Add only, when Paid): tap to fill the form, long press to delete.
2. **Amount**, large. Under it, on Add with Paid selected, the **Split with someone** pill (see 4.4).
3. **Type choice.** Only two choices, decided by where the form was opened:
   - from Expenses: **Paid | Received**
   - from Given & Taken or a person page: **I gave | I took**
   - editing or Review details: the pair that fits that entry
   - money received back or returned: fixed text, no choice
   The screen title follows the choice ("Add Expense", "Money Given", "Edit Shop Payment"...).
4. **Category**, a row of icons to scroll and tap, with **+ New**. Hidden for money given or taken (saved under the hidden "Loans" category) and for shop payments.
5. **Details card:** name (Paid to whom? / Received from whom? / Person's name), What for? (Note for given or taken), and **Return by** for I gave or I took. Past names and purposes appear as suggestion chips; picking one can fill an empty category. For people, "Same person as Rahul Kumar?" appears when a similar name exists.
6. **More details card** (always open): payment method (UPI, Cash, Card, Other), bank account (+ New), date and time as two pills (future dates are blocked), UPI reference, notes.
7. **Save as template** (Add, Paid only) and **Delete** (Edit only).
8. A **Save bar** fixed at the bottom. It rides on top of the keyboard.

Validation (`src/domain/validation.js`):

| Rule | Detail |
| --- | --- |
| Amount | More than ₹0, at most 2 decimals, at most ₹1,00,00,000 |
| Category | Required (set automatically for given or taken) |
| Date and time | Not in the future (one minute of tolerance) |
| Type | Must match the direction (paid or received) |
| Name | Required for money given or taken. Saved with one space between words, so "Rahul  Kumar" and "Rahul Kumar" are one person |
| Return by | Only kept for I gave or I took, and not before the entry's day |
| Money received back or returned | Cannot be more than the remaining amount (`checkReturnAmount`) |
| Editing or deleting money given or taken | Cannot leave money received back or returned larger than what there was to receive or return at that time (`checkLoanChange`). Example: ₹1,000 given and all paid back cannot be lowered to ₹500, deleted or turned into money taken. A person who was already inconsistent before (for example from an entry dated in the past) can still be edited |
| Split | Your share must stay above ₹0 (see 4.4) |

A fast double tap on Save cannot save twice (a ref guards it). If saving fails, the error shows and everything typed stays.

### 4.4 Split payment

For one payment where part was yours and part was for other people, for example a ₹1,000 train ticket where ₹400 was for a friend.

- Tap **Split with someone** under the amount (Add only, Paid only). The pill turns teal ("Split on"); tap it again to remove the split.
- A **Split card** appears under the type choice: your share (updates as you type), a bar of your share against theirs, and one row per person (initials, name, amount, remove), plus **+ Add person**.
- On save, **your share is saved as an expense** and each other person's share is saved as **money given** to that person. All parts share `split_group` (the id of your share) and are saved together or not at all.
- From Review details on a detected bank payment, the same split works, and Undo removes all parts.
- Deleting one part asks: **Only this one** or **All N parts** (your share and what was paid for others). Editing one part does not change the others: for example a new date on your share stays unchanged on the other parts.

### 4.5 Repeat purchases

Display only. Every purchase stays its own transaction, so totals, UPI matching, edit and delete are unchanged.

- Entries with the **same name** (shop or purpose, ignoring capitals and extra spaces), **category**, **direction** and **day** share one row: "Chocolate (3), −₹90.00, 9:10 AM to 6:40 PM".
- Tap the row to open it and see each purchase (time, how paid, amount). Each can be swiped to edit or delete.
- Entries with no name never group. A single entry is a normal row. A payment to a shop account never joins the purchases it pays for.
- Used on the Expenses tab and in History. Sorting by Largest orders groups by their day total.

### 4.6 History

Opened from Expenses ("View all") and More. Lists expenses and income only: money given or taken and shop payments are not here.

- Search by name, shop or purpose (plain substring match, so `%` and `_` are not wildcards).
- Month selector, or **All months** from the Filters sheet.
- **All / Paid / Received** chips.
- **Filters** sheet: Sort by (Newest, Oldest), Missing purpose, All months, Category, Paid by, Bank account.
- A summary line: number of transactions, Spent and Received.
- Links from other screens open it already filtered: "need a purpose" (from Expenses) and a category (from Reports).
- The list only draws what is on screen, which matters with All months.

### 4.7 Given & Taken

Money you gave to people and money you took from people. None of it is spending or income.

**The tab**
- Two tiles, **Money to receive** and **Money to return**, each with a **+** to add and a line "Given today ₹x" or "Taken today ₹x" (or "Nothing today").
- A **Money given (n) | Money taken (n)** switch. Each list shows people with the remaining amount, a status icon (amber clock while pending, green tick once settled), how long it has been open, the totals ("Gave ₹59,000", "Got back ₹2,000"), the start date and, if set, **Return by** or **Overdue**.
- Fully settled people come last. Swipe a person right to record money received back or returned.
- **Search** appears from 6 people, or while it has text. **Filters** sheet: Show (All, Pending, Settled) and Sort by (Latest, Largest, Oldest pending).

**The person page**
- A card with initials, the name, a Pending or Settled tag, and a pencil to **rename or combine** (typing the name of someone already in the list merges the two; it changes money given and taken entries only).
- The remaining amount (big), when it started and how long it has been open, the **Return by** line, and two total tiles ("Total given | Received back" or "Total taken | Returned").
- Round buttons: **Record** (money received back or returned, with the name and the remaining amount filled in), **Remind** (shares a friendly message, only for money to receive), **Gave more**, **Took more**.
- **Summary:** a ring with the share that came back, since when, when money last came back, and the entry count.
- **Statement:** every entry oldest first, with "→ ₹50,000.00 left" after each. Swipe right to edit, left to delete.

**Return by (optional)**
- Set on an I gave or I took entry. Stored as the end of the chosen day.
- Shown as "Return by 9 Nov", or in red "Overdue by 3 days". Only the date set since the current amount opened counts, so an old date from a settled round never marks new money overdue. A settled person shows no line.
- There is no reminder notification (see 14).

**People matching:** by name, ignoring capitals and spaces at the ends (`lower(trim(merchant))`).

### 4.8 Shop accounts

For a shop where you take now and pay later, like the diary kept with a tea shop. Created for one shop at first (a tea shop), but any number can be added.

**The rule (the diary rule)**

```
Oct: carried over ₹0     + taken ₹3,000 - paid ₹2,000 = ₹1,000 due
Nov: carried over ₹1,000 + taken ₹1,500 - paid ₹0     = ₹2,500 due
```

- Each item taken **counts as spending on the day you take it**, in the shop's category.
- **Paying the shop only lowers what is due.** It is never counted as spending again, so nothing is counted twice.
- What is left at the end of a month carries to the next. A month with nothing still carries it.
- **Already due** (what your diary says when you start) is carried into the first month and is not spending.
- You cannot pay more than what is due.

**Set up:** More > Shop accounts > **+ New shop account**: name, category, usual amount, already due.

**On the Expenses tab:** one slim strip per account: icon, name, "₹2,500.00 due · 38 this month ›" and a **+ ₹40** button. The button opens a sheet with the last amount filled in; saving adds the item (shown in lists as "Pay later"). Tap the rest of the strip for the Statement.

**Statement page:** the amount due (big) with a breakdown ("₹1,000 from Oct + ₹1,500 in Nov"), **+ ₹40** and **Pay** (UPI or Cash). Below, one folding row per month, newest first and open: due at the end, three figures (From last month, Taken · N times, Paid) and the entries by day. Swipe to edit or delete.

**Paying from a bank SMS:** on the Review card, money paid shows a **Shop** choice (when at least one shop account exists). The bank name is remembered for next time (see 4.10). A payment edited later is titled "Edit Shop Payment" and cannot be turned into something else.

**Where shop entries show up**

| Entry | Spending | Expenses list and History | Statement |
| --- | --- | --- | --- |
| Item taken (purchase) | Yes, on its day | Yes, as "Pay later" | Yes |
| Payment to the shop | No | No | Yes |
| Already due | No | No | Carried over |

Items taken need no purpose, so they never appear under "Need a purpose".

### 4.9 Reports

One month at a glance, built to be understood quickly.

- **Month card:** "Spent in November", the total (large), the change from last month ("▲ ₹2,000 more than Oct" in red, "▼ ... less" in green, "Same as Oct", or "Nothing spent in Oct to compare"), a **ring** of spending by category (top five plus a grey "Other categories"; nothing is written inside it), a two-column legend with each name and %, then "Received ₹x · N expenses".
- **Where it went:** every category with its color dot, expense count, amount and %. Tap one to see its entries in History for that month.
- **Given & Taken:** one card with Money to receive and Money to return as full-width lines and a "View all ›" link (shown only when there are people). All time, never part of spending or income.
- With no expenses in the month, an empty state explains how to add one.

The ring colors were checked for color-blind safety, and every slice is also named with its percentage.

### 4.10 Review payments, remembered names, bank accounts

**Review payments** (More tab, banner at the top with the waiting count)
- Payments found in bank SMS and UPI app notifications, grouped by day. See section 8 for how they are found.
- Each card is laid out like the form: name and signed amount; a choice bar (**Expense | I gave | Returned** for money paid, **Income | I took | Received back** for money received, plus **Shop** when shop accounts exist); Category icons with + New (hidden for given, taken and shop); read-only lines (Payment method, Bank account, Date & time, UPI reference, Found in); the main button; links **Review details**, **Ignore**, **Bank message**.
- **Possible duplicates** show a warning with the payment they look like; Ignore is the main action and Add anyway asks first.
- **Add all N** adds only items that are ready (not a possible duplicate, has a category, a person has a name, and not money received back, returned or a shop payment). It asks first.
- Add, Ignore and Add all show an **Undo** bar for a few seconds. If Add all stops partway because of an error, Undo is still offered for the payments already added.
- A payment you added and later **delete** (from a list or its edit screen) comes back here to be reviewed again, instead of staying marked as added.
- Category suggestions never use the hidden **Loans** category, whether they come from a past entry, remembered names or the form's name and purpose chips.
- If the name matches a person with money still open, the card suggests Money received back or Money returned (only when the amount fits the remaining amount) and says why.

**Remembered names** (table `name_memory`)
- When you add a detected payment, the app remembers, for the bank's spelling of the name ("RAHUL KUMAR S"): your spelling ("Rahul"), the category (expenses and income), and the type (I gave, I took, or the shop account).
- The next payment with that name arrives filled in, with a line "Bank shows "RAHUL KUMAR S" · filled from last time".
- Order of choice on a card: your pick, then the money-back suggestion, then the remembered shop, then the remembered given or taken, then expense or income. Possible duplicates ignore the remembered type.
- Editing the saved entry later updates what is remembered, and renaming a person updates it too.

**Bank accounts:** created automatically from the bank name and last 4 digits in messages. Tap one to give it a friendly name. **+ Add account** adds one by hand.

### 4.11 Backup and restore

More > Backup & restore.

- **Save backup file** writes one JSON file and opens the share sheet (Google Drive, WhatsApp to yourself, email). The screen shows the last backup time. Keep the file off the phone.
- **Choose backup file** reads a file, checks it, then asks before replacing everything on the phone. It shows how many entries the file has and how many the phone has now. Restoring is all or nothing, and it also clears payments waiting for review.
- Included: categories, bank accounts, shop accounts, templates, all transactions, remembered names, settings. Not included: the captured bank messages (they hold raw SMS text; what you added from them is in your transactions).
- A backup from an older database version restores with defaults for new columns, and the built-in categories it lacks (Income, Uncategorized, Loans) are added, so money given or taken can still be saved. A backup from a newer version is refused, and so is a file with no categories (it is treated as damaged).
- The file is **not encrypted or password protected**. The screen says so.
- Format: `{ app: 'upi-expense-tracker', format: 1, schemaVersion, createdAt, tables: {...} }`. Code: `src/db/backup.js`, `src/services/backupFile.js`.

### 4.12 Small interface behavior

- **Month selector:** a calendar-style tile with the month and year, round arrows, and a month name you can tap to open a **month grid** (year arrows, 12 months, "Go to this month"). You cannot go past the current month.
- **Keyboard:** Android draws apps edge to edge, so the screen no longer shrinks when the keyboard opens. `react-native-keyboard-controller` keeps the box you type in above the keyboard on the form, the person page, Bank accounts, Review payments and Shop accounts. The form's Save bar rides on top of the keyboard.
- **Swipe rows:** right edits, left deletes (always with confirmation). Needs `react-native-gesture-handler` (the root layout wraps the app). Deleting works the same from every list and from the edit screen (`useDeleteTransaction`):
  - a payment that came from a bank SMS goes back to Review payments;
  - a part of a split asks whether to delete only it or all parts;
  - money given or taken is refused, with the reason, when deleting it would leave money received back or returned larger than what there was at that time.
- **Counts and today lines** use a shared grey pill (`CountPill`).
- **Empty, loading and error states** use shared components (`States.js`).

## 5. Money rules

What counts where. This is the most important table in this document.

| Entry | Spending | Income | Expenses list, History | Given & Taken | Shop statement |
| --- | --- | --- | --- | --- | --- |
| Expense (paid) | Yes | No | Yes | No | No |
| Income (received) | No | Yes | Yes | No | No |
| I gave | No | No | No | Yes | No |
| I took | No | No | No | Yes | No |
| Money received back | No | No | No | Yes | No |
| Money returned | No | No | No | Yes | No |
| Shop item taken | Yes | No | Yes ("Pay later") | No | Yes |
| Shop payment | No | No | No | No | Yes |
| Split | Your share is an expense; each other share is money given | | | | |

Other rules:

- **Money is integer paise** everywhere (₹12.50 is `1250`). Never floats. Indian grouping (₹1,23,456.78) comes from a hand-written `formatINR`.
- **Direction:** `'debit'` is money paid, `'credit'` is money received.
- **Remaining amount:** I gave and money returned add to what a person owes you; I took and money received back subtract (see `NET_SIGN` in `src/domain/loans.js`).
- **Dates** are stored as UTC milliseconds and shown in the phone's local time.
- **SQL** uses `?` placeholders only. Multi-step writes use `withExclusiveTransactionAsync`.
- **Spending queries** share one definition (`IN_RANGE` in `src/db/reports.js`, `NOT_SHOP_PAYMENT` in `src/db/transactions.js`). A new kind of entry must be added there, or it will be counted wrongly.

## 6. Data model (SQLite, schema version 6)

Migrations run in `SQLiteProvider` `onInit`, tracked with `PRAGMA user_version`. Each step runs in its own transaction. **Shipped migrations are never edited**; changes are appended as a new one.

| Table | Purpose | Main columns |
| --- | --- | --- |
| `categories` | Default and custom categories | `name` (unique, ignores case), `is_default`, `sort_order` |
| `transactions` | Every saved entry | `amount_paise` (> 0), `direction`, `purpose`, `category_id`, `occurred_at`, `payment_method`, `merchant` (name), `reference`, `notes`, `source` (manual or notification), `account_id`, `loan_type`, `due_at`, `split_group`, `shop_account_id`, `shop_entry` |
| `settings` | Key and value (for example the last backup time) | `key`, `value` |
| `templates` | Quick-add entries (amount optional) | `name`, `amount_paise`, `category_id`, `use_count`, `last_used_at` |
| `accounts` | Bank accounts found in messages | `bank_name`, `last4` (unique together), `nickname` |
| `detected_payments` | One row per captured notification | `capture_id` (unique), `source_package`, `raw_text`, parsed fields, `status`, `possible_duplicate`, `transaction_id` |
| `name_memory` | What you saved for a bank's spelling of a name | `bank_name`, `merchant`, `category_id`, `loan_type`, `shop_account_id` |
| `shop_accounts` | Take now, pay later accounts | `name` (unique), `category_id`, `usual_amount_paise`, `opening_due_paise` |

Column meanings worth knowing:

- `loan_type`: `lent`, `borrowed`, `lent_repaid`, `borrowed_repaid` (shown as I gave, I took, Money received back, Money returned).
- `status` of a detected payment: `pending`, `added`, `ignored`, `duplicate`, `unrecognized`.
- `shop_entry`: `purchase` (item taken, counted as spending) or `payment` (paying the shop, not spending).
- `split_group`: parts of one split payment share the id of your share.
- `due_at`: the "Return by" date, only used for `lent` and `borrowed`.

Categories: 13 defaults (Food & Dining, Groceries, Petrol & Transport, Shopping, Bills & Utilities, Rent, Health, Entertainment, Travel, Education, Personal Care, Transfers, Other), plus **Income**, **Uncategorized** and **Loans**. Loans is used automatically for money given or taken and for split parts, and is never offered in a category picker. Payment methods: UPI, Cash, Card, Other.

Version history:

| Version | Added |
| --- | --- |
| 1 | Base tables and the 13 default categories |
| 2 | Templates |
| 3 | Bank accounts, detected payments, Income and Uncategorized categories |
| 4 | `loan_type` (money given and taken) and the Loans category |
| 5 | `due_at`, `split_group`, and the `name_memory` table |
| 6 | `shop_accounts`, `shop_account_id` and `shop_entry`, and `name_memory.shop_account_id` |

Upgrading never loses data, and an upgrade cannot be undone. Save a backup before installing an update that includes a new version.

## 7. Technology and structure

| Area | Choice | Version |
| --- | --- | --- |
| Framework | React Native with Expo (managed, Continuous Native Generation) | Expo SDK 58 (`expo ~58.0.22`), React Native 0.88.1, React 19.3.0 |
| Language | JavaScript only (no TypeScript, by requirement) | |
| Navigation | Expo Router, file-based, routes in `src/app/` | `expo-router ~58.0.29` |
| Database | `expo-sqlite`, WAL mode, foreign keys on | `~58.0.15` |
| Styling | React Native `StyleSheet`, tokens in `src/constants/theme.js` | |
| Icons | Thin outline icons drawn with `react-native-svg` (no icon font package) | 15.16.0 |
| Gestures and animation | `react-native-gesture-handler`, `react-native-reanimated`, `react-native-worklets` | ~3.3.0, 4.7.1, 0.13.0 |
| Keyboard | `react-native-keyboard-controller` | 1.22.7 |
| Date and time input | `@react-native-community/datetimepicker` | 9.2.1 |
| Backup | `expo-file-system`, `expo-sharing`, `expo-document-picker` | ~58.0.13, ~58.0.22, ~58.0.4 |
| Native code | Local Expo module in Kotlin (`modules/upi-notification-listener`) | |
| Builds | EAS Build in the cloud. `development` (dev client APK) and `preview` (standalone APK) | |
| Tests | Node test runner with `node:sqlite`, through an adapter that mimics the expo-sqlite API | Node 22.13+ or 24.3+ (`.nvmrc` says 24) |
| Code quality | ESLint (`eslint-config-expo`, includes React Compiler rules), Prettier (width 120, single quotes) | |

Notes:
- `react-dom` is pinned to the same version as `react`, or npm fails with ERESOLVE.
- Install packages with `npx expo install` so versions match the SDK.
- The React Compiler lint rules forbid impure calls such as `Date.now()` during render, and reassigning a variable inside a `.map` during render.
- `app.json` still has template `ios` and `web` entries that are unused.

### Folder structure

```
src/
  app/                    Screens (Expo Router). Every file is a route.
    _layout.js            Opens the database, runs migrations, keyboard and gesture providers, the Stack.
    (tabs)/               Bottom tabs: index.js (Expenses), given-taken.js, reports.js, more.js
    transaction/          new.js (add) and [id].js (edit)
    history.js            All expenses and income, with filters
    loan/[person].js      One person's balance, summary and statement
    review-payments.js    Detected payments waiting for Add, Edit or Ignore
    auto-detect.js        Notification access, battery, alerts, recent bank messages
    accounts.js           Bank accounts
    shops.js              Shop accounts list and "New shop account" form
    shop/[id].js          A shop account's statement
    backup.js             Backup and restore
  components/             Reusable UI: Amount, TransactionRow, RepeatGroupRow, TransactionForm, SplitCard,
                          FilterSheet, MonthSelector, CategoryRing, TodoCard, ShopAccount, AmountSheet,
                          DetectedPaymentCard, SwipeableRow, CountPill, icons, ...
  constants/              Theme tokens, default categories, payment methods
  db/                     All SQL, one file per area: transactions, reports, detected, accounts, categories,
                          templates, suggestions, shopAccounts, backup. migrations.js holds schema versions.
  domain/                 Business rules, no UI or SQL: validation, split, loans, repeats, shopAccount,
                          transactionForm, categorize, banks, paymentParser
  hooks/                  useFocusQuery (reload on focus), useAsyncValue, useDeleteTransaction
  services/               detection.js (native listener to database), backupFile.js (file and share sheet)
  ui/                     Toasts and confirmation dialogs
  utils/                  Money and date formatting, text masking, source app names
modules/upi-notification-listener/   Kotlin native module (section 9)
tests/                    Node tests
docs/                     This file
```

Rules of the split: screens in `app/` only compose; SQL lives only in `db/`; rules that need no UI or database live in `domain/` so they can be tested alone. Non-route code never goes inside `src/app/`.

## 8. Payment detection pipeline

1. **Android service** (`PaymentNotificationListenerService.kt`, a `NotificationListenerService`). It runs only after the user turns on Notification access. On Android 13 and later the user must first allow "restricted settings" for sideloaded apps.
2. **Filter on the phone:** keeps a notification only if it has an amount (₹, Rs, INR, or a bare amount next to Dr or Cr wording) and a payment word (debited, credited, paid, received, Dr, Cr...). Messages with OTP wording are dropped. Truecaller copies are ignored. The app's own notifications are ignored.
3. **Full text:** reads conversation-style messages, big text, text lines and plain text, so a whole SMS is captured, not only the preview.
4. **No repeats:** a fingerprint per message (package, title, message id or key, post time, text) is remembered (last 1000).
5. **Private queue:** kept items wait in app-private storage (max 500) until the app opens.
6. **Optional alert:** a "Payment detected" notification (needs `POST_NOTIFICATIONS`) opens Review payments through the `upiexpensetracker://review-payments` link.
7. **Reconnect:** the service asks Android to rebind when disconnected, and the app asks again on every open. The app checks whether battery optimization is off and guides the user.
8. **Sync** (`src/db/detected.js`, called by `services/detection.js` whenever Expenses, Review or Payment detection opens): moves the queue into `detected_payments` in a transaction, then empties the native queue. A failure on one item leaves it queued for retry. Waiting items are re-read with the current rules, so parser improvements also fix payments already waiting. Added and ignored items are never changed.
9. **Parsing** (`src/domain/paymentParser.js`, `src/domain/banks.js`): regex based. Extracts direction, amount in paise, bank (39 banks, longest match wins), last 4 account digits, name and UPI reference. Supports "NAME paid you ₹X" (Google Pay), "Dr./Cr." formats and amounts without a currency sign. Unknown formats are kept as "unrecognized" so nothing is lost.
10. **Duplicates:** the same UPI reference as a saved or detected payment is a duplicate. Without a reference, a similar amount, direction and time within 15 minutes is a **possible** duplicate (never merged silently). Two different references are never duplicates. A split payment saved by hand is compared by its **total** (its shares added up), both by time and by UPI reference, because the bank reports the whole amount.
11. **Category suggestion** (`src/db/detected.js`, `src/domain/categorize.js`): what you saved for that name (remembered names), then the category last used for the name, then keyword rules, then Uncategorized. Received money defaults to Income.

Known source behavior: Google Pay posts no notification for money sent, but does for money received. Bank SMS (through Google Messages) is the main source. If a bank sends no SMS and no app notification, the payment cannot be detected and must be added by hand.

## 9. Native module API (`modules/upi-notification-listener/index.js`)

`isAvailable`, `isPermissionGranted`, `reconnectListener`, `isBatteryUnrestricted`, `openPermissionSettings`, `openAppSettings`, `areRemindersEnabled`, `setRemindersEnabled`, `canShowReminders`, `supportsReminders`, `getCapturedNotifications`, `removeCapturedNotifications`, `clearCapturedNotifications`.

The JS side loads it with `requireOptionalNativeModule`, so the app still runs without it (for example in Expo Go), with detection turned off.

## 10. Privacy and security

- Data is stored only on the phone. No network calls for user data. Uninstalling deletes everything.
- No bank passwords, UPI PINs, OTPs or full account numbers are stored. Only the last 4 digits of an account.
- The listener service is protected by `BIND_NOTIFICATION_LISTENER_SERVICE`, so only Android can bind to it.
- "Share masked" on a captured message hides account numbers, UPI IDs and references. It cannot detect names, and the UI says so.
- **Not encrypted:** the database, and the backup file, can be read by anyone who can unlock the phone or has the file. There is no app lock.
- Test files use made-up sample messages only.

## 11. Testing

`npm test` runs **113 tests** (Node test runner, no phone needed). They use only made-up data.

| File | Covers |
| --- | --- |
| `money`, `dates`, `maskText` | Parsing and formatting money, date edges, masking text |
| `paymentParser`, `banks` | Many bank message formats, bank matching |
| `database`, `phase2`, `phase3` | Migrations and upgrades from older versions, transactions, reports, templates, suggestions, detection sync, duplicates, undo |
| `loans`, `peopleTools` | Balances, dates, summaries, sorting and showing people, similar names, rename and combine |
| `accountsAndFilters` | Bank accounts and list filters |
| `repeats` | Grouping repeat purchases |
| `newFeatures` | Split payments, remembered names, return by, backup and restore, audit fixes |
| `shopAccounts` | The diary rule, spending exclusions, shop payments from bank SMS, backup of shop accounts |
| `gapFixes` | Deleting a bank payment, editing or deleting money given or taken, the hidden Loans category, split duplicates and split delete, names, restoring an old backup, Add all stopping partway |

Commands: `npm run check` runs lint, format check and tests. `npx expo export --platform android --output-dir <folder>` confirms the app bundles. There are no screen (UI) tests: screens are checked by hand on a phone.

## 12. Build and run

| Command | Result |
| --- | --- |
| `npm start` | Dev server for the development build |
| `npm run start:go` or `start:go:tunnel` | Try screens in Expo Go |
| `npm run build:dev` | Cloud build of the development client APK |
| `npm run build:app` | Cloud build of the standalone APK (what is used day to day) |
| `npm run check` | Lint, format check and tests (run before finishing any change) |
| `npx expo-doctor` | Checks package versions against the SDK |

**Windows note:** put Node 24 first on the path before running project commands, for example in PowerShell `$env:Path = "C:\Users\<you>\AppData\Local\nvm\v24.22.1;" + $env:Path`. Other projects on the same PC may use another Node version.

**Installing a build:** open the download link on the phone and tap **Update**. **Never uninstall first**, because that deletes all data. Save a backup (More > Backup & restore) before updating.

**Expo Go** is for looking at screens. It has its own empty database and no payment detection. To open it, type the `exp://` address by hand in Expo Go (the QR code does not work with this project, because the development client is also installed). Expo's own documents disagree on whether Expo Go includes `react-native-keyboard-controller`, so check keyboard behavior in the real build.

**Troubleshooting**
- *"Cannot find native module 'ExpoSQLite'"*: the app that opened the project does not have the SQLite part. Open the address in Expo Go itself, not in another app, and close any old dev server (a second server may be running on port 8081).
- *Phone cannot connect over Wi-Fi:* use the tunnel command.

## 13. Known issues and open items

**No open issues** from the code review of 2026-11-11. Its nine findings were fixed the same day (see the change log). In short:

| # | Was | Now |
| --- | --- | --- |
| 1 | Deleting a payment that came from a bank SMS left it marked "added", so the same payment could never be reviewed again | It goes back to Review payments |
| 2 | Editing or deleting money given or taken was not checked against money already received back or returned | Refused when it would leave money received back or returned too large (4.3) |
| 3 | The hidden Loans category could be suggested for expenses | Never suggested (4.10) |
| 4 | A split entered by hand did not flag its bank SMS as a possible duplicate | Compared by the split's total and by UPI reference (8) |
| 5 | Deleting a split's expense left the other people's parts | Deleting asks: only this one, or all parts (4.4) |
| 6 | A search could keep filtering with its box hidden | The box stays while it has text (4.2, 4.7) |
| 7 | A double space in a name made a second person | Names are saved with single spaces (4.3) |
| 8 | Restoring a backup older than schema version 4 lost the Loans category | Built-in categories are added on restore (4.11) |
| 9 | If Add all failed partway, there was no Undo | Undo is offered for what was added (4.10) |

Possible, not verified: the last backup time may be recorded even if the share sheet was dismissed; Review details can contradict the SMS direction (for example Paid to Received); Undo after editing an entry you just added removes the edit too.

Other limits:
- Bank sender IDs and formats for most of the 39 banks follow common published formats and are **not verified** with real messages. Kotak debit and BoB messages still need real samples.
- Parsing is regex based and will miss new formats (kept as "unrecognized").
- Android battery management can still stop the listener despite the reconnect logic.
- A typo in a name creates a separate person (the "Same person as...?" hint and Rename help). Names saved before 2026-11-11 with a double space inside also stay separate until you use Rename to combine them.
- Editing one part of a split payment (for example its date) does not change the other parts.
- No dark mode, no app lock, no crash reporting (by design, no network). Accessibility labels exist on main controls but are not audited.
- `LICENSE` is still the Expo template's file and needs a decision.

## 14. Decisions

| Decision | Detail |
| --- | --- |
| Android only, JavaScript only | Required by the owner |
| Money given and taken is never spending or income | Kept in its own tab, with its own totals |
| Shop payments are not spending | The items already counted on the day taken; otherwise they would count twice |
| Each purchase stays one transaction | Grouping repeat purchases is display only, so duplicate checks, edit and Undo keep working |
| Small spends feature removed | Grouping small purchases across shops, quick-add tiles and automatic adding of small UPI payments were built and then removed at the owner's request on 2026-11-11 |
| Import and export of statements (CSV) postponed | By the owner |
| Changes to look and wording are shown first | The owner picks from options before anything is applied |
| Nothing is committed for the owner | The owner decides when and where to commit |
| A delete or edit cannot make a person inconsistent | Money received back or returned may never be more than what there was to receive or return at that time. A person who was already inconsistent can still be edited, so old data is never locked |
| Deleting a bank payment un-adds it | The payment returns to Review payments instead of staying marked as added |

Ideas not built (put on hold by the owner): app lock with fingerprint or PIN; manage categories (rename, merge, hide, delete) and templates; warn on a manual entry that matches a recent payment; reminder notification for Return by dates; repeating entries (rent, subscriptions); budget per category; CSV export; "Add" inside the payment alert; a year view in Reports; dark mode; a warning when no bank SMS has been read for several days or the last backup is old.

## 15. Change log

| Date | Change |
| --- | --- |
| 2026-10-25 | Phase 1 (basic app) verified on device; Phase 2 (faster entry) built |
| 2026-10-27 | Phase 3: UPI notification detection, parser, review list, accounts, income; verified for Kotak credit and BOI debit |
| 2026-10-28 | Fixes for missed payments, friendlier review list; money given and taken added |
| 2026-10-30 to 10-31 | UI simplification; wording rules; separate Expenses and Given & Taken tabs; swipe rows; Given & Taken tools (pending time, sort, remind, rename, combine); person page redesign |
| 2026-11-01 | Svg icons and tab icons; Filters bottom sheet; form redesign (icons, More details card); month selector; Reports redesign |
| 2026-11-02 | Review card laid out like the form; today totals and count pills on tiles; Reports ring chart |
| 2026-11-04 | Repeat purchases share a row; split payment; remembered names; return by date; month grid; faster lists; backup and restore; Reports "total on top" layout; keyboard fix; to-do card on Expenses |
| 2026-11-11 | Audit fixes (return by from an old round, remembered names on rename and edit); shop accounts (schema 6) and their redesign; small spends built then removed; More tab redesigned ("Review first"); this documentation |
| 2026-11-11 | Fixed the nine gaps from the code review: deleting a bank payment returns it to Review; editing or deleting money given or taken is checked against money received back; Loans never suggested for expenses; split payments compared by total for duplicates and deleted as a whole on request; search boxes stay while they have text; names saved with single spaces; old backups restore the built-in categories; Add all keeps Undo when it stops partway (113 tests) |

## 16. Suggested review focus

1. **Money handling:** paise conversion, totals that exclude given or taken, shop payments and split parts where they should.
2. **Deleting and editing rules** (`useDeleteTransaction`, `checkLoanChange`, `deleteTransactions`): could a valid change be refused, or a bad one slip through?
3. **Parser robustness** (`paymentParser.js`, `banks.js`): false positives (OTP, offers, balance alerts) and misses.
4. **Duplicate logic** (`src/db/detected.js`): could a real payment be marked duplicate, or a duplicate slip through?
5. **Native service** (`PaymentNotificationListenerService.kt`, `CapturedNotificationStore.kt`): thread safety, the fingerprint design, behavior when the app is killed.
6. **Migrations and backup restore:** safety of upgrades and restores on a phone with existing data.
7. **Privacy:** logs, shared text, backup file handling, notifications on the lock screen.
8. **Code quality:** the folder split (app, components, db, domain) and duplicated styles.
