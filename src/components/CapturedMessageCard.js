import { Share, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, spacing } from '../constants/theme';
import { formatDateTime } from '../utils/dates';
import { maskSensitiveText } from '../utils/maskText';
import { sourceAppName } from '../utils/sourceApps';
import { Button } from './Button';
import { Card } from './Card';

const STATUS_LABELS = {
  pending: { text: 'Waiting for review', color: colors.primary },
  added: { text: 'Added to transactions', color: colors.success },
  ignored: { text: 'Ignored', color: colors.textMuted },
  duplicate: { text: 'Duplicate (already saved)', color: colors.textMuted },
  unrecognized: { text: 'Not a payment message', color: colors.warning },
};

/** A bank SMS or app notification the app captured, with what happened to it. */
export function CapturedMessageCard({ item, onRestore }) {
  const status = STATUS_LABELS[item.status] ?? STATUS_LABELS.unrecognized;
  const source = sourceAppName(item.sourcePackage);

  async function shareMasked() {
    const message = maskSensitiveText(`${item.title ?? ''}\n${item.rawText}`);
    try {
      await Share.share({ message: `${message}\n(app: ${item.sourcePackage})` });
    } catch (error) {
      console.error(error);
    }
  }

  return (
    <Card style={styles.card}>
      <View style={styles.top}>
        <Text style={[styles.status, { color: status.color }]}>{status.text}</Text>
        {source ? <Text style={styles.source}>{source}</Text> : null}
      </View>
      {item.title ? <Text style={styles.title}>{item.title}</Text> : null}
      <Text style={styles.text}>{item.rawText}</Text>
      <View style={styles.footer}>
        <Text style={styles.time}>{formatDateTime(item.postedAt)}</Text>
        <Button label="Share masked" variant="secondary" onPress={shareMasked} style={styles.smallButton} />
      </View>
      {item.status === 'ignored' && onRestore ? (
        <Button label="Review again" variant="secondary" onPress={() => onRestore(item)} />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs },
  top: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  status: { fontSize: fontSize.sm, fontWeight: '700' },
  source: { fontSize: fontSize.sm, color: colors.textMuted },
  title: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  text: { fontSize: fontSize.md, color: colors.text },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  time: { fontSize: fontSize.sm, color: colors.textMuted },
  smallButton: { minHeight: 40 },
});
