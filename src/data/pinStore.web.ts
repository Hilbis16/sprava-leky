const PIN_KEY = 'moje-leky.senior-pin';

export async function getSeniorPin(): Promise<string | null> {
  try { return globalThis.localStorage?.getItem(PIN_KEY) ?? null; } catch { return null; }
}

export async function setSeniorPin(pin: string | null): Promise<void> {
  try {
    if (pin) globalThis.localStorage?.setItem(PIN_KEY, pin);
    else globalThis.localStorage?.removeItem(PIN_KEY);
  } catch { /* Storage blocked: the web preview simply has no PIN. */ }
}
