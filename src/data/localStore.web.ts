
import type { AppData } from '@/domain/types';
import { createDemoData } from './demo';
import { createEmptyData, storageKey } from './empty';
import { localDataSchema } from './localSchema';
import { serializeAppData } from './serialize';


export async function loadAppData(accountId?: string): Promise<AppData> {
  try {
    const raw = globalThis.localStorage?.getItem(storageKey(accountId));
    if (!raw) return accountId ? createEmptyData() : createDemoData();
    const parsed: unknown = JSON.parse(raw);
    return localDataSchema.parse(parsed) as unknown as AppData;
  } catch {
    console.warn('Webová data se nepodařilo načíst.');
    throw new Error('Uložená data nelze načíst. Neprovádějte reset; zachovejte je pro obnovu.');
  }
}

export async function saveAppData(data: AppData, accountId?: string): Promise<void> {
  const raw = serializeAppData(data);
  globalThis.localStorage?.setItem(storageKey(accountId), raw);
}

export async function resetAppData(): Promise<AppData> {
  const data = createDemoData();
  await saveAppData(data);
  return data;
}
