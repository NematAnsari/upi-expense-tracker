import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PAYMENT_METHODS } from '../constants/categories';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { Button } from './Button';
import { CategoryIcon } from './CategoryIcon';
import { ICONS, METHOD_ICONS, OutlineIcon } from './icons';

/** How many of the payment filters are on (category, payment method, bank account). */
export function countFilters(filters) {
  return [filters.categoryId, filters.paymentMethod, filters.accountId].filter((value) => value != null).length;
}

/** The "Filters" button that opens the sheet; teal with a count while filters are on. */
export function FilterButton({ count = 0, onPress }) {
  const on = count > 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={on ? `Filters, ${count} on` : 'Filters'}
      onPress={onPress}
      style={({ pressed }) => [styles.button, on && styles.buttonOn, pressed && styles.pressed]}
    >
      <OutlineIcon draw={ICONS.filter} color={on ? colors.primary : colors.textMuted} />
      <Text style={[styles.buttonText, on && styles.buttonTextOn]}>{on ? `Filters (${count})` : 'Filters'}</Text>
    </Pressable>
  );
}

/** An outline icon in the small grey circle used by every choice. */
function circleIcon(draw) {
  function Icon(color) {
    return (
      <View style={styles.circle}>
        <OutlineIcon draw={draw} color={color} />
      </View>
    );
  }
  return Icon;
}

// Rows with this many choices or fewer share the full width instead of scrolling.
const SPREAD_UP_TO = 4;

/**
 * One labelled row of icon choices in the sheet. Up to 4 choices share the
 * whole width; more scroll sideways.
 * choices: [{ value, label, draw }] (an icon from icons.js) or
 * [{ value, label, icon: (color) => element }] for a ready-made icon.
 * The selected choice is teal. onSelect(value) is called on tap.
 */
export function ChoiceRow({ label, choices, value, onSelect }) {
  const spread = choices.length <= SPREAD_UP_TO;
  const cells = choices.map((choice) => {
    const selected = choice.value === value;
    const color = selected ? colors.primary : colors.textMuted;
    const icon = choice.icon ?? circleIcon(choice.draw);
    return (
      <Pressable
        key={choice.value}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${choice.label}`}
        accessibilityState={{ selected }}
        onPress={() => onSelect(choice.value)}
        style={[styles.cell, spread && styles.cellSpread, selected && styles.cellSelected]}
      >
        {icon(color)}
        <Text style={[styles.cellText, selected && styles.cellTextSelected]} numberOfLines={1}>
          {choice.label}
        </Text>
      </Pressable>
    );
  });
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {spread ? (
        <View style={[styles.cells, styles.spreadRow]}>{cells}</View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.cells}
          keyboardShouldPersistTaps="handled"
        >
          {cells}
        </ScrollView>
      )}
    </View>
  );
}

/**
 * The Category / Paid by / Bank account rows for expense lists. Tap a choice
 * to filter, tap it again to clear it; the filters combine.
 * filters: { categoryId, paymentMethod, accountId } (null = any).
 * onToggle(key, value) sets or clears one. The bank row is hidden when there are no accounts.
 */
export function PaymentFilters({ filters, onToggle, categories, accounts = [] }) {
  return (
    <>
      <ChoiceRow
        label="Category"
        choices={categories.map((category) => ({
          value: category.id,
          label: category.name.split(' ')[0],
          icon: (color) => <CategoryIcon categoryName={category.name} small color={color} />,
        }))}
        value={filters.categoryId}
        onSelect={(value) => onToggle('categoryId', value)}
      />
      <ChoiceRow
        label="Paid by"
        choices={PAYMENT_METHODS.map((method) => ({
          value: method,
          label: method,
          draw: METHOD_ICONS[method] ?? ICONS.more,
        }))}
        value={filters.paymentMethod}
        onSelect={(value) => onToggle('paymentMethod', value)}
      />
      {accounts.length > 0 ? (
        <ChoiceRow
          label="Bank account"
          choices={accounts.map((account) => ({ value: account.id, label: account.nickname, draw: ICONS.bank }))}
          value={filters.accountId}
          onSelect={(value) => onToggle('accountId', value)}
        />
      ) : null}
    </>
  );
}

/**
 * A bottom sheet titled "Filters" with the given rows (children), then
 * Clear all and a Show button. showLabel: the Show button's text, such as
 * "Show 12 entries"; it closes the sheet.
 */
export function FilterSheet({ visible, onClose, onClear, showLabel, children }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close filters">
        {/* Taps inside the sheet must not close it. */}
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={styles.title}>Filters</Text>
          {children}
          <View style={styles.buttons}>
            <Button label="Clear all" variant="secondary" onPress={onClear} style={styles.flex} />
            <Button label={showLabel} onPress={onClose} style={styles.flex} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.6 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  buttonOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  buttonText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  buttonTextOn: { color: colors.primary },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(17, 24, 39, 0.4)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.md * 2,
    borderTopRightRadius: radius.md * 2,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border },
  title: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  section: { gap: spacing.xs },
  sectionLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  cells: { gap: spacing.xs },
  // Same as the payment method and bank account cells in the form's More details:
  // grows with its label between the min and max width.
  cell: {
    minWidth: 60,
    maxWidth: 96,
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
  },
  spreadRow: { flexDirection: 'row' },
  // Equal shares of the row, with no max width.
  cellSpread: { flex: 1, maxWidth: undefined },
  cellSelected: { backgroundColor: colors.primarySoft },
  cellText: { fontSize: fontSize.xs, color: colors.textMuted, textAlign: 'center', paddingHorizontal: 2 },
  cellTextSelected: { color: colors.primary, fontWeight: '700' },
  circle: {
    minWidth: 28,
    minHeight: 28,
    maxWidth: 36,
    maxHeight: 36,
    padding: spacing.xs,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  buttons: { flexDirection: 'row', gap: spacing.md },
});
