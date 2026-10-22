import type { AccountUser } from './sessionTypes';

const KEY = 'moje-leky.api-account.v1';
export async function getSavedSession(): Promise<{ user: AccountUser; token?: string } | null> {
  try { const raw = globalThis.localStorage?.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
export async function getAuthToken(): Promise<string | undefined> { return undefined; }
// Authentication stays in the server's HttpOnly cookie; this is only offline display metadata.
export async function saveSession(user: AccountUser, _token?: string) { globalThis.localStorage?.setItem(KEY,JSON.stringify({ user })); }
export async function clearSession() { globalThis.localStorage?.removeItem(KEY); }
