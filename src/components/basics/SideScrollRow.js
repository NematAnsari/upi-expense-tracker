import { ScrollView, StyleSheet } from 'react-native';
import { spacing } from '../../constants/theme';

/**
 * A single row of chips or icons that scrolls sideways when it does not fit.
 * style: the row's own spacing, in place of the default chip spacing.
 */
export function SideScrollRow({ style = styles.row, children }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={style}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingVertical: 2 },
});
