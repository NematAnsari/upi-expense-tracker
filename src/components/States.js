// Shared loading, empty and error views, so every screen handles them the same way.

import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, spacing } from '../constants/theme';
import { Button } from './Button';

export function LoadingState({ message = 'Loading...' }) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

export function EmptyState({ title, message, actionLabel, onAction }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {actionLabel ? <Button label={actionLabel} onPress={onAction} style={styles.action} /> : null}
    </View>
  );
}

export function ErrorState({ message = 'Something went wrong while loading your data.', onRetry }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Could not load data</Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry ? <Button label="Try again" variant="secondary" onPress={onRetry} style={styles.action} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  title: { fontSize: fontSize.lg, fontWeight: '600', color: colors.text, textAlign: 'center' },
  message: { fontSize: fontSize.md, color: colors.textMuted, textAlign: 'center' },
  action: { marginTop: spacing.md, alignSelf: 'stretch' },
});
