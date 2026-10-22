import * as SecureStore from 'expo-secure-store';
import type { AccountUser } from './sessionTypes';

const KEY = 'moje-leky.api-session.v1';
export async function getSavedSession(): Promise<{ user: AccountUser; token?: string } | null> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
export async function getAuthToken() { return (await getSavedSession())?.token; }
export async function saveSession(user: AccountUser, token?: string) { await SecureStore.setItemAsync(KEY,JSON.stringify({ user,token })); }
export async function clearSession() { await SecureStore.deleteItemAsync(KEY); }
