import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { addShopPayment, addShopPurchase, checkShopPayment } from '../../db/shopAccounts';
import { showMessage } from '../../utils/notify';
import { formatShortMonth, shiftMonth } from '../../utils/dates';
import { formatINR, formatINRShort, paiseToInputString } from '../../utils/money';
import { Amount } from '../basics/Amount';
import { AmountSheet } from '../form/AmountSheet';
import { Button } from '../basics/Button';
import { CategoryIcon } from '../icons/CategoryIcon';

/**
 * Add (one more tea) and Pay for a shop account: returns openSheet('add' | 'pay'),
 * the two sheets to render, and the add button's label ("+ ₹40").
 * account: from listShopAccounts. onChanged(): reload.
 */
function useAddAndPaySheets(account, onChanged) {
  const db = useSQLiteContext();
  // Which sheet is open, and a fresh key each time so it starts clean.
  const [sheet, setSheet] = useState(null);
  const [sheetKey, setSheetKey] = useState(0);
  const usualPaise = account.usualAmountPaise;

  function openSheet(kind) {
    setSheetKey((key) => key + 1);
    setSheet(kind);
  }

  async function addPurchase(amountPaise, method, occurredAt) {
    await addShopPurchase(db, account.id, amountPaise, occurredAt);
    setSheet(null);
    showMessage(`Added ${formatINR(amountPaise)} at ${account.name}`);
    onChanged();
    return null;
  }

  async function pay(amountPaise, method, occurredAt) {
    const tooMuch = await checkShopPayment(db, account.id, amountPaise);
    if (tooMuch) {
      return tooMuch;
    }
    await addShopPayment(db, account, {
      amountPaise,
      accountId: null,
      purpose: null,
      occurredAt,
      paymentMethod: method,
      reference: null,
      notes: null,
    });
    setSheet(null);
    showMessage(`Paid ${formatINR(amountPaise)} to ${account.name}`);
    onChanged();
    return null;
  }

  const sheets = (
    <>
      <AmountSheet
        key={`add-${sheetKey}`}
        visible={sheet === 'add'}
        title={`Add at ${account.name}`}
        note="Counted as spending today. Paid later from this account."
        initialAmountText={usualPaise ? paiseToInputString(usualPaise) : ''}
        withDate
        submitLabel="Add"
        onSubmit={addPurchase}
        onClose={() => setSheet(null)}
      />
      <AmountSheet
        key={`pay-${sheetKey}`}
        visible={sheet === 'pay'}
        title={`Pay ${account.name}`}
        note={`${formatINR(account.duePaise)} due. Paying lowers what is due; it is not counted as spending again.`}
        initialAmountText={paiseToInputString(account.duePaise)}
        withMethod
        withDate
        submitLabel="Pay"
        onSubmit={pay}
        onClose={() => setSheet(null)}
      />
    </>
  );
  return { openSheet, sheets, addLabel: usualPaise ? `+ ${formatINRShort(usualPaise)}` : '+ Add' };
}

/**
 * The shop account on the Expenses tab, one slim line:
 *   (cup) XYZ Tea                         [ + ₹40 ]
 *         ₹2,500.00 due · 38 this month ›
 * "+ ₹40" adds one with the last amount (changeable in the sheet); tap the
 * rest for the Statement page, where Pay and the months are.
 */
export function ShopAccountRow({ account, onChanged, onOpenStatement }) {
  const { openSheet, sheets, addLabel } = useAddAndPaySheets(account, onChanged);
  const count = account.month.count;
  return (
    <View style={styles.strip}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${account.name}, ${account.duePaise > 0 ? `${formatINR(account.duePaise)} due` : 'nothing due'}, ${count} this month. Open the statement`}
        onPress={() => onOpenStatement(account)}
        style={({ pressed }) => [styles.stripMain, pressed && styles.pressed]}
      >
        <CategoryIcon categoryName={account.categoryName} direction="debit" />
        <View style={styles.flex}>
          <Text style={styles.name} numberOfLines={1}>
            {account.name}
          </Text>
          <Text style={styles.muted} numberOfLines={1}>
            {account.duePaise > 0 ? <Amount paise={account.duePaise} direction="debit" size="sm" /> : 'Nothing'}
            {` due · ${count} this month ›`}
          </Text>
        </View>
      </Pressable>
      <Button label={addLabel} onPress={() => openSheet('add')} style={styles.stripAdd} />
      {sheets}
    </View>
  );
}

/**
 * The top of the Statement page:
 *   (cup) XYZ Tea
 *            ₹2,500.00
 *               due
 *     ₹1,000 from Oct + ₹1,500 in Nov
 *   [ + ₹40 ]            [ Pay ]
 */
export function ShopAccountHeader({ account, onChanged }) {
  const { openSheet, sheets, addLabel } = useAddAndPaySheets(account, onChanged);
  const { month } = account;
  const carried =
    month.carriedInPaise > 0
      ? `${formatINRShort(month.carriedInPaise)} from ${formatShortMonth(shiftMonth(month.monthKey, -1))} + `
      : '';
  const paid = month.paidPaise > 0 ? ` − ${formatINRShort(month.paidPaise)} paid` : '';
  const breakdown = `${carried}${formatINRShort(month.purchasesPaise)} in ${formatShortMonth(month.monthKey)}${paid}`;
  return (
    <View style={styles.hero}>
      <View style={styles.heroTop}>
        <CategoryIcon categoryName={account.categoryName} direction="debit" />
        <Text style={styles.name} numberOfLines={1}>
          {account.name}
        </Text>
      </View>
      <View
        style={styles.heroAmount}
        accessible
        accessibilityLabel={`${formatINR(account.duePaise)} due. ${breakdown}`}
      >
        {account.duePaise > 0 ? (
          <Amount paise={account.duePaise} direction="debit" size="xxl" />
        ) : (
          <Text style={styles.nothing}>Nothing due</Text>
        )}
        {account.duePaise > 0 ? <Text style={styles.muted}>due</Text> : null}
        <Text style={[styles.muted, styles.centered]}>{breakdown}</Text>
      </View>
      <View style={styles.heroButtons}>
        <Button label={addLabel} onPress={() => openSheet('add')} style={styles.flex} />
        <Button
          label="Pay"
          variant="secondary"
          onPress={() => openSheet('pay')}
          disabled={account.duePaise <= 0}
          style={styles.flex}
        />
      </View>
      {sheets}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.6 },
  muted: { fontSize: fontSize.sm, color: colors.textMuted },
  centered: { textAlign: 'center', marginTop: spacing.xs },
  name: { flexShrink: 1, fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  // Same white card look as the to-do card above it.
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  stripMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48 },
  stripAdd: { minWidth: 84, minHeight: 40, paddingHorizontal: spacing.md },
  hero: {
    gap: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroAmount: { alignItems: 'center', gap: 2 },
  nothing: { fontSize: fontSize.xl, fontWeight: '700', color: colors.textMuted },
  heroButtons: { flexDirection: 'row', gap: spacing.md },
});
