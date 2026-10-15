import * as SecureStore from 'expo-secure-store';

// The senior-mode PIN only guards against leaving the mode by accident. It is
// device-local and never synced.
const PIN_KEY = 'moje-leky.senior-pin';

export async function getSeniorPin(): Promise<string | null> {
  return SecureStore.getItemAsync(PIN_KEY);
}

export async function setSeniorPin(pin: string | null): Promise<void> {
  if (pin) await SecureStore.setItemAsync(PIN_KEY, pin);
  else await SecureStore.deleteItemAsync(PIN_KEY);
}
