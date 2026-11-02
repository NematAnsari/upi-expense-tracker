import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { PAYMENT_METHODS } from '../constants/categories';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { formatShortDate, formatTime, withDateFrom, withTimeFrom } from '../utils/dates';
import { Button } from './Button';
import { Card } from './Card';
import { ICONS, METHOD_ICONS, OutlineIcon } from './icons';
import { TextField } from './TextField';

/** The small icon at the start of each line. */
function RowIcon({ name }) {
  return (
    <View style={styles.rowIcon}>
      <OutlineIcon draw={ICONS[name]} />
    </View>
  );
}

/** One tappable choice: an icon in a circle and a short label; teal when selected. */
function IconCell({ label, selected, onPress, draw, dashed }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.cell, selected && styles.cellSelected]}
    >
      <View style={[styles.cellCircle, dashed && styles.cellCircleDashed]}>
        <OutlineIcon draw={draw} color={selected || dashed ? colors.primary : colors.textMuted} />
      </View>
      <Text style={[styles.cellText, (selected || dashed) && styles.cellTextSelected]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A line you tap to show its choices underneath (a row of icon cells), plus anything extra below. */
function ChoiceLine({ icon, label, required, value, open, onToggle, error, children, below }) {
  return (
    <View style={styles.lineBorder}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}. Change`}
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        style={({ pressed }) => [styles.line, pressed && styles.pressed]}
      >
        <RowIcon name={icon} />
        <Text style={styles.label}>
          {label}
          {required ? <Text style={styles.required}> *</Text> : null}
        </Text>
        <Text style={styles.value} numberOfLines={1}>
          {value}
        </Text>
        <Text style={styles.chevron}>{open ? '⌃' : '›'}</Text>
      </Pressable>
      {open ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.cells}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : null}
      {open ? below : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

/** A line with a text box on the right (UPI reference, notes). */
function InputLine({ icon, label, value, onChange, placeholder, maxLength, last, ...inputProps }) {
  return (
    <View style={[styles.line, !last && styles.lineBorder]}>
      <RowIcon name={icon} />
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        maxLength={maxLength}
        style={styles.input}
        accessibilityLabel={label}
        {...inputProps}
      />
    </View>
  );
}

/**
 * Date & time: two small values on the right of the line, "1 Nov" and
 * "3:05 PM"; each opens Android's own picker straight away. Future dates
 * cannot be picked. value / onChange use milliseconds.
 */
function DateTimeLine({ value, onChange, error }) {
  function open(mode) {
    if (Platform.OS !== 'android') {
      return;
    }
    DateTimePickerAndroid.open({
      value: new Date(value),
      mode,
      is24Hour: false,
      maximumDate: mode === 'date' ? new Date() : undefined,
      onChange: (event, picked) => {
        if (event.type !== 'set' || !picked) {
          return;
        }
        const base = new Date(value);
        onChange((mode === 'date' ? withDateFrom(base, picked) : withTimeFrom(base, picked)).getTime());
      },
    });
  }
  return (
    <View style={styles.lineBorder}>
      <View style={styles.line}>
        <RowIcon name="date" />
        <Text style={styles.label}>Date & time</Text>
        <View style={styles.when}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Date: ${formatShortDate(value)}. Change date`}
            onPress={() => open('date')}
            hitSlop={6}
            style={({ pressed }) => [styles.whenPill, pressed && styles.pressed]}
          >
            <Text style={styles.whenText}>{formatShortDate(value)}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Time: ${formatTime(value)}. Change time`}
            onPress={() => open('time')}
            hitSlop={6}
            style={({ pressed }) => [styles.whenPill, pressed && styles.pressed]}
          >
            <Text style={styles.whenText}>{formatTime(value)}</Text>
          </Pressable>
        </View>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

/** The "+ New" box under the bank account cells: a name, Add and Cancel. */
function NewAccount({ onCreate, onCancel }) {
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function add() {
    if (saving) {
      return;
    }
    setSaving(true);
    try {
      await onCreate(name);
    } catch (createError) {
      setError(createError.message || 'Could not add the account.');
      setSaving(false);
    }
  }

  return (
    <View style={styles.newBlock}>
      <View style={styles.newRow}>
        <TextField
          value={name}
          onChangeText={(text) => {
            setName(text);
            setError(null);
          }}
          placeholder="Account name, e.g. SBI Salary"
          maxLength={40}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={add}
          error={error}
          style={styles.flex}
          accessibilityLabel="New account name"
        />
        <Button label="Add" onPress={add} loading={saving} />
        <Button label="Cancel" variant="secondary" onPress={onCancel} />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

/**
 * The form's "More details" card, always open:
 *   (card)  Payment method *        UPI ›    tap: UPI / Cash / Card / Other icons
 *   (bank)  Bank account     BOI ••1111 ›    tap: None + your accounts + "+ New"
 *   (cal)   Date & time   [1 Nov] [3:05 PM]  each opens Android's picker
 *   (#)     UPI reference          Optional
 *   (note)  Notes                  Optional
 * values: { paymentMethod, accountId, occurredAt, reference, notes }.
 * onChange(field, value) updates one of them. errors: { paymentMethod, occurredAt }.
 * onCreateAccount(name) saves a new account and returns it (or throws with a
 * message); it is then selected.
 */
export function MoreDetailsCard({ values, onChange, accounts = [], onCreateAccount, errors = {} }) {
  const [open, setOpen] = useState(null);
  const [adding, setAdding] = useState(false);
  const toggle = (key) => {
    setOpen(open === key ? null : key);
    setAdding(false);
  };
  const account = accounts.find((candidate) => candidate.id === values.accountId);
  const pick = (field, value) => {
    onChange(field, value);
    setOpen(null);
    setAdding(false);
  };

  async function createAccount(name) {
    const created = await onCreateAccount(name);
    pick('accountId', created.id);
  }

  return (
    <Card title="More details">
      <ChoiceLine
        icon="card"
        label="Payment method"
        required
        value={values.paymentMethod}
        open={open === 'method'}
        onToggle={() => toggle('method')}
        error={errors.paymentMethod}
      >
        {PAYMENT_METHODS.map((method) => (
          <IconCell
            key={method}
            label={method}
            selected={values.paymentMethod === method}
            draw={METHOD_ICONS[method] ?? ICONS.more}
            onPress={() => pick('paymentMethod', method)}
          />
        ))}
      </ChoiceLine>

      <ChoiceLine
        icon="bank"
        label="Bank account"
        value={account?.nickname ?? 'None'}
        open={open === 'account'}
        onToggle={() => toggle('account')}
        below={adding ? <NewAccount onCreate={createAccount} onCancel={() => setAdding(false)} /> : null}
      >
        <IconCell
          label="None"
          selected={values.accountId == null}
          draw={ICONS.more}
          onPress={() => pick('accountId', null)}
        />
        {accounts.map((candidate) => (
          <IconCell
            key={candidate.id}
            label={candidate.nickname}
            selected={values.accountId === candidate.id}
            draw={ICONS.bank}
            onPress={() => pick('accountId', candidate.id)}
          />
        ))}
        {onCreateAccount ? <IconCell label="New" dashed draw={ICONS.plus} onPress={() => setAdding(true)} /> : null}
      </ChoiceLine>

      <DateTimeLine
        value={values.occurredAt}
        onChange={(value) => onChange('occurredAt', value)}
        error={errors.occurredAt}
      />
      <InputLine
        icon="reference"
        label="UPI reference"
        value={values.reference}
        onChange={(text) => onChange('reference', text)}
        placeholder="Optional"
        maxLength={60}
        autoCapitalize="none"
      />
      <InputLine
        icon="notes"
        label="Notes"
        value={values.notes}
        onChange={(text) => onChange('notes', text)}
        placeholder="Optional"
        maxLength={500}
        last
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.6 },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52 },
  lineBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowIcon: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  label: { width: 120, fontSize: fontSize.sm, color: colors.textMuted },
  required: { color: colors.danger },
  value: { flex: 1, textAlign: 'right', fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  chevron: { width: 16, textAlign: 'center', fontSize: fontSize.lg, color: colors.textMuted },
  input: { flex: 1, textAlign: 'right', fontSize: fontSize.md, color: colors.text, paddingVertical: spacing.sm },
  error: { fontSize: fontSize.sm, color: colors.danger, paddingBottom: spacing.sm },
  cells: { gap: spacing.xs, paddingBottom: spacing.md },
  // Grows with its label between the min and max width.
  cell: {
    minWidth: 60,
    maxWidth: 96,
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
  },
  cellSelected: { backgroundColor: colors.primarySoft },
  cellCircle: {
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
  cellCircleDashed: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary },
  cellText: { fontSize: fontSize.xs, color: colors.textMuted, textAlign: 'center', paddingHorizontal: 2 },
  cellTextSelected: { color: colors.primary, fontWeight: '700' },
  newBlock: { gap: spacing.xs, paddingBottom: spacing.md },
  newRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  when: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  whenPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
  },
  whenText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
});
