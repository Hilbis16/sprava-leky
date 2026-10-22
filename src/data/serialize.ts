import type { AppData } from '@/domain/types';
import { localDataSchema } from './localSchema';

/** Ověří stav před zápisem, aby chybný vstup nepřepsal poslední čitelnou kopii. */
export function serializeAppData(data: AppData): string {
  localDataSchema.parse(data);
  return JSON.stringify(data, (_key, value: unknown) => {
    // Kontroluje také payloady fronty a doplňková pole, která schéma zachovává.
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Neplatné číslo nelze uložit.');
    return value;
  });
}
