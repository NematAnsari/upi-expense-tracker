import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { PAYMENT_METHODS } from '../../constants/categories';
import { colors, fontSize, spacing } from '../../constants/theme';
import { formatShortDate, formatTime, withDateFrom, withTimeFrom } from '../../utils/dates';
import { Card } from '../basics/Card';
import { ChoiceCell, IconInCircle } from '../basics/ChoiceCell';
import { LineIcon } from '../basics/LineIcon';
import { SideScrollRow } from '../basics/SideScrollRow';
import { MAX_ACCOUNT_NAME_LENGTH } from '../../domain/validation';
import { ICONS, METHOD_ICONS } from '../icons/icons';
import { AddNameBox } from './AddNameBox';
import { DatePill, openPicker } from './DatePill';

/** One choice: an icon in a circle and a short label. dashed: the "+ New" choice, always teal. */
function IconChoice({ label, selected, draw, dashed, onPress }) {
  return (
    <ChoiceCell label={label} selected={selected} teal={dashed} onPress={onPress}>
      <IconInCircle draw={draw} color={selected || dashed ? colors.primary : colors.textMuted} dashed={dashed} />
    </ChoiceCell>
  );
}

/** A line you tap to show its choices underneath (a row of icon choices), plus anything extra below. */
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
        <LineIcon draw={ICONS[icon]} />
        <Text style={styles.label}>
          {label}
          {required ? <Text style={styles.required}> *</Text> : null}
        </Text>
        <Text style={styles.value} numberOfLines={1}>
          {value}
        </Text>
        <Text style={styles.chevron}>{open ? '⌃' : '›'}</Text>
      </Pressable>
      {open ? <SideScrollRow style={styles.choices}>{children}</SideScrollRow> : null}
      {open ? below : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

/** A line with a text box on the right (UPI reference, notes). */
function InputLine({ icon, label, value, onChange, placeholder, maxLength, last, ...inputProps }) {
  return (
    <View style={[styles.line, !last && styles.lineBorder]}>
      <LineIcon draw={ICONS[icon]} />
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
 * Date & time: two pills on the right, "1 Nov" and "3:05 PM"; each opens
 * Android's picker. Future dates cannot be picked. value / onChange use milliseconds.
 */
function DateTimeLine({ value, onChange, error }) {
  function pick(mode) {
    const options = {
      value: new Date(value),
      mode,
      is24Hour: false,
      maximumDate: mode === 'date' ? new Date() : undefined,
    };
    openPicker(options, (picked) => {
      const base = new Date(value);
      onChange((mode === 'date' ? withDateFrom(base, picked) : withTimeFrom(base, picked)).getTime());
    });
  }
  return (
    <View style={styles.lineBorder}>
      <View style={styles.line}>
        <LineIcon draw={ICONS.date} />
        <Text style={styles.label}>Date & time</Text>
        <View style={styles.when}>
          <DatePill
            text={formatShortDate(value)}
            spokenLabel={`Date: ${formatShortDate(value)}. Change date`}
            onPress={() => pick('date')}
          />
          <DatePill
            text={formatTime(value)}
            spokenLabel={`Time: ${formatTime(value)}. Change time`}
            onPress={() => pick('time')}
          />
        </View>
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
 *   (msg)   Source                 Optional, filled in for a detected payment
 *   (note)  Notes                  Optional
 * values: { paymentMethod, accountId, occurredAt, reference, sourceText, notes }.
 * onChange(field, value) updates one of them. errors: { paymentMethod, occurredAt }.
 * onCreateAccount(name) saves a new account and returns it (or throws with a
 * message); it is then selected.
 */
export function MoreDetailsCard({ values, onChange, accounts = [], onCreateAccount, errors = {} }) {
  // Which line shows its choices: 'method', 'account' or null.
  const [openLine, setOpenLine] = useState(null);
  const [addingAccount, setAddingAccount] = useState(false);
  const account = accounts.find((candidate) => candidate.id === values.accountId);

  function toggleLine(key) {
    setOpenLine(openLine === key ? null : key);
    setAddingAccount(false);
  }

  function pickAndClose(field, value) {
    onChange(field, value);
    setOpenLine(null);
    setAddingAccount(false);
  }

  async function createAccount(name) {
    const created = await onCreateAccount(name);
    pickAndClose('accountId', created.id);
  }

  return (
    <Card title="More details">
      <ChoiceLine
        icon="card"
        label="Payment method"
        required
        value={values.paymentMethod}
        open={openLine === 'method'}
        onToggle={() => toggleLine('method')}
        error={errors.paymentMethod}
      >
        {PAYMENT_METHODS.map((method) => (
          <IconChoice
            key={method}
            label={method}
            selected={values.paymentMethod === method}
            draw={METHOD_ICONS[method] ?? ICONS.more}
            onPress={() => pickAndClose('paymentMethod', method)}
          />
        ))}
      </ChoiceLine>

      <ChoiceLine
        icon="bank"
        label="Bank account"
        value={account?.nickname ?? 'None'}
        open={openLine === 'account'}
        onToggle={() => toggleLine('account')}
        below={
          addingAccount ? (
            <AddNameBox
              placeholder="Account name, e.g. SBI Salary"
              spokenLabel="New account name"
              maxLength={MAX_ACCOUNT_NAME_LENGTH}
              failText="Could not add the account."
              onAdd={createAccount}
              onCancel={() => setAddingAccount(false)}
              style={styles.newAccount}
              errorStyle={styles.newAccountError}
            />
          ) : null
        }
      >
        <IconChoice
          label="None"
          selected={values.accountId == null}
          draw={ICONS.more}
          onPress={() => pickAndClose('accountId', null)}
        />
        {accounts.map((candidate) => (
          <IconChoice
            key={candidate.id}
            label={candidate.nickname}
            selected={values.accountId === candidate.id}
            draw={ICONS.bank}
            onPress={() => pickAndClose('accountId', candidate.id)}
          />
        ))}
        {onCreateAccount ? (
          <IconChoice label="New" dashed draw={ICONS.plus} onPress={() => setAddingAccount(true)} />
        ) : null}
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
        icon="envelope"
        label="Source"
        value={values.sourceText}
        onChange={(text) => onChange('sourceText', text)}
        placeholder="Optional"
        maxLength={60}
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
  pressed: { opacity: 0.6 },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52 },
  lineBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  label: { width: 120, fontSize: fontSize.sm, color: colors.textMuted },
  required: { color: colors.danger },
  value: { flex: 1, textAlign: 'right', fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  chevron: { width: 16, textAlign: 'center', fontSize: fontSize.lg, color: colors.textMuted },
  input: { flex: 1, textAlign: 'right', fontSize: fontSize.md, color: colors.text, paddingVertical: spacing.sm },
  error: { fontSize: fontSize.sm, color: colors.danger, paddingBottom: spacing.sm },
  choices: { gap: spacing.xs, paddingBottom: spacing.md },
  newAccount: { gap: spacing.xs, paddingBottom: spacing.md },
  newAccountError: { paddingBottom: spacing.sm },
  when: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
});
