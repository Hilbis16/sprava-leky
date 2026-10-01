import Storage from 'expo-sqlite/kv-store';
import { z } from 'zod';

import type { AppData } from '@/domain/types';
import { createDemoData } from './demo';

const STORAGE_KEY = 'moje-leky:app-data:v1';

// Persisted data are validated at the boundary before the app trusts them. The
// detailed entity invariants remain enforced by the domain actions.
const appDataEnvelope = z.object({ schemaVersion: z.literal(1) }).passthrough();

export async function loadAppData(): Promise<AppData> {
  try {
    const raw = await Storage.getItem(STORAGE_KEY);
    if (!raw) return createDemoData();
    const parsed: unknown = JSON.parse(raw);
    const envelope = appDataEnvelope.parse(parsed);
    return envelope as unknown as AppData;
  } catch (error) {
    console.warn('Lokální data se nepodařilo načíst, používám demo data.', error);
    return createDemoData();
  }
}

export async function saveAppData(data: AppData): Promise<void> {
  await Storage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export async function resetAppData(): Promise<AppData> {
  const data = createDemoData();
  await saveAppData(data);
  return data;
}
