import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, spacing } from '../../constants/theme';
import { formatINR } from '../../utils/money';
import { Amount } from '../basics/Amount';
import { Chip } from '../basics/Chip';
import { SideScrollRow } from '../basics/SideScrollRow';

/** Plain-text name for a template, e.g. "Petrol · ₹500.00" (for dialogs and screen readers). */
export function templateLabel(template) {
  return template.amountPaise != null ? `${template.name} · ${formatINR(template.amountPaise)}` : template.name;
}

/** Row of saved templates. Tap to use one; long press to delete (when onLongPress is given). */
export function TemplateBar({ templates, onApply, onLongPress }) {
  if (templates.length === 0) {
    return null;
  }
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Templates</Text>
      <SideScrollRow>
        {templates.map((template) => (
          <Chip
            key={template.id}
            label={template.name}
            accessory={template.amountPaise != null ? <Amount paise={template.amountPaise} size="sm" /> : null}
            onPress={() => onApply(template)}
            onLongPress={onLongPress ? () => onLongPress(template) : undefined}
          />
        ))}
      </SideScrollRow>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  title: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
});
