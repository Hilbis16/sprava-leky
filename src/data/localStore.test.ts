import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDemoData } from './demo';
import { storageKey } from './empty';
import { loadAppData as loadNative, saveAppData as saveNative } from './localStore';
import { loadAppData as loadWeb, saveAppData as saveWeb } from './localStore.web';

const storage = vi.hoisted(() => new Map<string, string>());
vi.mock('expo-sqlite/kv-store', () => ({ default: {
  getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
  setItem: vi.fn(async (key: string, value: string) => { storage.set(key, value); }),
} }));
beforeEach(() => {
  storage.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
  });
});

describe.each([
  { name: 'SQLite', save: saveNative, load: loadNative },
  { name: 'web', save: saveWeb, load: loadWeb },
])('Ochrana poslední čitelné kopie – $name', ({ save, load }) => {
  it('nepřepíše data neplatným číslem a dovolí následně uložit opravu', async () => {
    const good = createDemoData();
    await save(good, 'account');
    const raw = storage.get(storageKey('account'));
    for (const invalid of [Infinity, -Infinity, NaN]) {
      const bad = { ...good, medications: [{ ...good.medications[0]!, packageSize: invalid }] };
      await expect(save(bad, 'account')).rejects.toThrow();
      expect(storage.get(storageKey('account'))).toBe(raw);
      expect(await load('account')).toEqual(good);
    }
    const corrected = { ...good, medications: [{ ...good.medications[0]!, packageSize: 30.5 }] };
    await save(corrected, 'account');
    expect(await load('account')).toEqual(corrected);
  });
  it('odmítne také neplatné číslo ukryté v payloadu fronty', async () => {
    const good = createDemoData();
    await save(good, 'account');
    const bad = { ...good, pendingMutations: [{ id: 'bad', entity: 'inventory_event' as const, payload: { quantity: Infinity }, createdAt: '2026-10-22T00:00:00Z' }] };
    await expect(save(bad, 'account')).rejects.toThrow('Neplatné číslo');
    expect(await load('account')).toEqual(good);
  });
});
