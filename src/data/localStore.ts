import Storage from 'expo-sqlite/kv-store';

import type { AppData } from '@/domain/types';
import { createDemoData } from './demo';
import { createEmptyData, storageKey } from './empty';
import { localDataSchema } from './localSchema';
import { serializeAppData } from './serialize';



export async function loadAppData(accountId?: string): Promise<AppData> {
  try {
    const raw = await Storage.getItem(storageKey(accountId));
    if (!raw) return accountId ? createEmptyData() : createDemoData();
    const parsed: unknown = JSON.parse(raw);
    const envelope = localDataSchema.parse(parsed);
    return envelope as unknown as AppData;
  } catch {
    console.warn('Lokální data se nepodařilo načíst.');
    throw new Error('Uložená data nelze načíst. Neprovádějte reset; zachovejte je pro obnovu.');
  }
}

let writes: Promise<void> = Promise.resolve();
export async function saveAppData(data: AppData, accountId?: string): Promise<void> {
  const raw = serializeAppData(data);
  const next = writes.catch(() => undefined).then(() => Storage.setItem(storageKey(accountId),raw));
  writes = next;
  await next;
}

export async function resetAppData(): Promise<AppData> {
  const data = createDemoData();
  await saveAppData(data);
  return data;
}
