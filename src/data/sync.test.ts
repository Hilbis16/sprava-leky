import { beforeEach,describe,expect,it,vi } from 'vitest';
import { createDemoData } from './demo';
import { createEmptyData,storageKey } from './empty';
import { applyServerSnapshot,bootstrapMutations,syncPendingMutations } from './sync';
import { apiRequest,ApiError } from './api';
import { applySyncResult } from './applySync';

vi.mock('./api',() => ({ apiEnabled: true,apiRequest: vi.fn(),ApiError: class extends Error {
  constructor(public status: number,public code: string,message: string) { super(message); }
} }));
const request = vi.mocked(apiRequest);
beforeEach(() => request.mockReset());
describe('Přenos do vlastního API',() => {
  it('oddělí úložiště účtů a neposílá automaticky demo historii',async () => {
    expect(storageKey('a')).not.toBe(storageKey('b'));
    expect(storageKey('a')).not.toBe(storageKey());
    expect(createEmptyData().profiles).toHaveLength(0);
    request.mockResolvedValue({ snapshots: [],revisions: {},acknowledged: [],syncedAt: '2026-10-21T00:00:00.000Z' });
    await syncPendingMutations(createDemoData(),'a');
    const init = request.mock.calls[0]![1]!;
    expect(JSON.parse(init.body as string).mutations).toEqual([]);
    expect(request.mock.calls[0]![2]).toBe('a');
  });
  it('výslovný import obsahuje celou inventuru a stabilní identifikátory',() => {
    const data = createDemoData();
    const queued = bootstrapMutations(data,'a');
    expect(queued).toEqual(bootstrapMutations(data,'a'));
    expect(queued.filter((m) => m.entity === 'inventory_event')).toHaveLength(data.inventoryEvents.length);
    expect(queued.filter((m) => m.entity === 'dose_action')).toHaveLength(data.doseActions.length);
    expect(queued.filter((m) => m.entity === 'profile')).toHaveLength(data.profiles.length);
    expect(() => bootstrapMutations({ ...data,regimens: [] },'a')).toThrow('chybí rozvrh');
  });
  it('při konfliktu ani výpadku neztratí čekající změny',async () => {
    const data = createDemoData(); data.pendingMutations = bootstrapMutations(data,'a');
    request.mockRejectedValueOnce(new ApiError(409,'SYNC_CONFLICT','Konflikt'));
    const conflict = await syncPendingMutations(data,'a');
    expect(conflict.conflict).toBe(true); expect(conflict.remaining).toEqual(data.pendingMutations);
    request.mockRejectedValueOnce(new Error('Výpadek'));
    expect((await syncPendingMutations(data,'a')).remaining).toEqual(data.pendingMutations);
  });
  it('potvrzené změny vyřadí a zrušené členství odstraní ze snapshotu',async () => {
    const data = createDemoData(); data.pendingMutations = bootstrapMutations(data,'a');
    request.mockResolvedValue({ snapshots: [],revisions: {},acknowledged: data.pendingMutations.map((m) => m.id),syncedAt: '2026-10-21T00:00:00.000Z' });
    const result = await syncPendingMutations(data,'a',true);
    expect(result.remaining).toEqual([]); expect(result.data?.profiles).toEqual([]);
    expect(JSON.parse(request.mock.calls[0]![1]!.body as string).force).toBe(true);
    const pulled = applyServerSnapshot(data,{ snapshots: [],revisions: {},syncedAt: '2026-10-21T00:00:00.000Z' });
    expect(pulled.medications).toEqual([]); expect(pulled.currentProfileId).toBe('');
  });
  it('velký import rozdělí a zachová neodeslaný konec nad serverovými daty',async () => {
    const source = createDemoData(),profile = source.profiles[0]!;
    const pendingMutations = Array.from({ length: 501 },(_,i) => ({ id: `import-${i}`,entity: 'profile' as const,payload: { ...profile,displayName: `Místní ${i}` },createdAt: '2026-10-21T00:00:00.000Z' }));
    const data = { ...source,pendingMutations };
    request.mockResolvedValue({ snapshots: [{ profile: { ...profile,displayName: 'Server' },memberships: [],medications: [],regimens: [],inventoryEvents: [],doseActions: [],prescribers: [],rxRequests: [] }],revisions: { [profile.id]: 1 },acknowledged: pendingMutations.slice(0,500).map((m) => m.id),syncedAt: '2026-10-21T00:00:00.000Z' });
    const result = await syncPendingMutations(data,'a');
    expect(JSON.parse(request.mock.calls[0]![1]!.body as string).mutations).toHaveLength(500);
    expect(result.remaining).toEqual([pendingMutations[500]]);
    const next = applySyncResult(data,new Set(pendingMutations.map((m) => m.id)),result);
    expect(next.profiles[0]?.displayName).toBe('Místní 500');
    expect(next.pendingMutations).toHaveLength(1);
  });
});
