import { Alert, Platform } from 'react-native';

/** Asks for confirmation; react-native-web ignores Alert buttons, so web uses window.confirm. */
export function confirmAction(title: string, message: string, confirmLabel: string, destructive = false): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(globalThis.confirm?.(`${title}\n\n${message}`) ?? false);
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Zrušit', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}
