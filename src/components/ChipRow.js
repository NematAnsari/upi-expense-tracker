import { ScrollView, StyleSheet } from 'react-native';
import { spacing } from '../constants/theme';

/** A single row of chips that scrolls sideways when it does not fit. */
export function ChipRow({ children }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.row}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingVertical: 2 },
});
