import { StyleSheet, View } from 'react-native';
import { colors, radius } from '../../constants/theme';
import { OutlineIcon } from '../icons/icons';

/** The small icon in a grey circle at the start of a details line (Payment method, Date & time...). */
export function LineIcon({ draw }) {
  return (
    <View style={styles.circle}>
      <OutlineIcon draw={draw} />
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
