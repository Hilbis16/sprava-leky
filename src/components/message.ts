import { Alert, Platform } from 'react-native';

/** Web má vlastní dialog; Alert z react-native-web zprávy nezobrazuje. */
export function showMessage(title: string, message: string): void {
  if (Platform.OS === 'web') {
    globalThis.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}
