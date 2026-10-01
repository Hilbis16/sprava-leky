import { z } from 'zod';

import type { AppData } from '@/domain/types';
import { createDemoData } from './demo';

const STORAGE_KEY = 'moje-leky:app-data:v1';
const appDataEnvelope = z.object({ schemaVersion: z.literal(1) }).passthrough();

export async function loadAppData(): Promise<AppData> {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return createDemoData();
    const parsed: unknown = JSON.parse(raw);
    return appDataEnvelope.parse(parsed) as unknown as AppData;
  } catch (error) {
    console.warn('Webová demo data se nepodařilo načíst.', error);
    return createDemoData();
  }
}

export async function saveAppData(data: AppData): Promise<void> {
  globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(data));
}

export async function resetAppData(): Promise<AppData> {
  const data = createDemoData();
  await saveAppData(data);
  return data;
}
