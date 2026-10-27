import { Alert, Platform, ToastAndroid } from 'react-native';

/** A short, non-blocking confirmation. Android shows a toast at the bottom of the screen. */
export function showMessage(message) {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  } else {
    Alert.alert(message);
  }
}
