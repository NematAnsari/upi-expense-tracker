// The form card to add a shop account (`isNew`) or edit one: name, category
// (new only), usual amount and what was already due. `children` go below the buttons.

import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../basics/Button';
import { Card } from '../basics/Card';
import { TextField } from '../basics/TextField';
import { CategoryIconRow } from '../form/CategoryIconRow';
import { colors, fontSize, spacing } from '../../constants/theme';
import { formatINR, parseAmountToPaise } from '../../utils/money';

/** The note under "Already due" on a new account, with the typed amount once it is valid. */
function carriedOverNote(openingText) {
  const opening = openingText.trim() ? parseAmountToPaise(openingText) : null;
  const carried = opening && !opening.error ? ` (${formatINR(opening.paise)} carried over)` : '';
  return `Pending amount at the shop today, before using the app. It is not counted as spending${carried}.`;
}

/** values: { name, categoryId, usualText, openingText }; onChange(field, value). */
export function ShopAccountForm({
  isNew,
  values,
  onChange,
  categories,
  onCreateCategory,
  error,
  saving,
  onCancel,
  onSave,
  children,
}) {
  return (
    <Card title={isNew ? 'New shop account' : 'Edit account'}>
      <View style={styles.form}>
        <Text style={styles.label}>{isNew ? 'Shop name *' : 'Shop name'}</Text>
        <TextField
          value={values.name}
          onChangeText={(text) => onChange('name', text)}
          placeholder={isNew ? 'For example: XYZ Tea' : undefined}
          maxLength={60}
          autoFocus={isNew}
          accessibilityLabel="Shop name"
        />
        {isNew ? (
          <>
            <Text style={styles.label}>Category *</Text>
            <CategoryIconRow
              categories={categories}
              selectedId={values.categoryId}
              onSelect={(id) => onChange('categoryId', id)}
              onCreate={onCreateCategory}
            />
          </>
        ) : null}
        <Text style={styles.label}>Usual amount</Text>
        <TextField
          value={values.usualText}
          onChangeText={(text) => onChange('usualText', text)}
          placeholder="For example: 40"
          keyboardType="decimal-pad"
          accessibilityLabel="Usual amount in rupees"
        />
        <Text style={styles.label}>{isNew ? 'Already due (from your diary)' : 'Already due when you started'}</Text>
        <TextField
          value={values.openingText}
          onChangeText={(text) => onChange('openingText', text)}
          placeholder="0"
          keyboardType="decimal-pad"
          accessibilityLabel={isNew ? 'Amount already due in rupees' : 'Amount already due when you started, in rupees'}
        />
        {isNew ? <Text style={styles.hint}>{carriedOverNote(values.openingText)}</Text> : null}
        {error ? (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
        <View style={styles.buttons}>
          <Button label="Cancel" variant="secondary" onPress={onCancel} style={styles.flex} />
          <Button label={isNew ? 'Add' : 'Save'} onPress={onSave} loading={saving} style={styles.flex} />
        </View>
        {children}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  form: { gap: spacing.sm },
  label: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text, marginTop: spacing.xs },
  hint: { fontSize: fontSize.sm, color: colors.textMuted },
  error: { fontSize: fontSize.sm, color: colors.danger },
  buttons: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
});
