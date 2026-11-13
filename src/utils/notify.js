// Messages and questions for the person using the app.

import { Alert, Platform, ToastAndroid } from 'react-native';

/** A short message that goes away by itself (a toast at the bottom on Android). */
export function showMessage(message) {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  } else {
    Alert.alert(message);
  }
}

/** Logs an error and shows it: the title, then the error's own words or "Please try again." */
export function showError(title, error, extra = '') {
  console.error(error);
  Alert.alert(title, `${error?.message || 'Please try again.'}${extra}`);
}

/**
 * Asks a question with buttons and waits for the answer. buttons:
 * [{ text, value, style }]. Resolves to the tapped button's value, or null
 * when the question is closed without an answer.
 */
export function askChoice(title, message, buttons) {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      buttons.map(({ text, value, style }) => ({ text, style, onPress: () => resolve(value) })),
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}
