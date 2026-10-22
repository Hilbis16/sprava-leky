import type { AppData, PendingMutation } from '@/domain/types';
import { apiEnabled, apiRequest, ApiError } from './api';
import { replaceFamilySnapshots, type FamilySnapshot } from './mergeFamily';

export interface ServerSnapshot { snapshots: FamilySnapshot[]; revisions: Record<string, number>; syncedAt: string }
export interface SyncResult {
  synced: boolean; remaining: PendingMutation[]; syncedAt?: string; message: string; data?: AppData;
  bootstrappedFor?: string; conflict?: boolean;
}

export function bootstrapMutations(data: AppData, userId: string): PendingMutation[] {
  const result: PendingMutation[] = [];
  const add = (entity: PendingMutation['entity'], id: string, payload: unknown) => result.push({
    id: `import:${userId}:${entity}:${id}`,entity,payload,createdAt: '2026-01-01T00:00:00.000Z',
  });
  data.profiles.forEach((p) => add('profile',p.id,p));
  data.medications.forEach((medication) => {
    const regimen = data.regimens.find((r) => r.medicationId === medication.id);
    if (!regimen) throw new Error('Původnímu léku chybí rozvrh. Nejprve opravte původní data; nebyla přepsána.');
    add('medication',medication.id,{ medication,regimen });
  });
  data.inventoryEvents.forEach((e) => add('inventory_event',e.id,e));
  data.doseActions.forEach((a) => add('dose_action',a.id,a));
  data.prescribers.forEach((p) => add('prescriber',p.id,p));
  data.rxRequests.forEach((r) => add('rx_request',r.id,r));
  return result;
}
export function applyServerSnapshot(base: AppData, result: ServerSnapshot): AppData {
  return { ...replaceFamilySnapshots(base,result.snapshots),remoteRevisions: result.revisions,lastSyncedAt: result.syncedAt };
}
export async function fetchServerSnapshot(base: AppData,userId: string): Promise<AppData> {
  const result = await apiRequest<ServerSnapshot>('/v1/snapshot',{},userId);
  return applyServerSnapshot(base,result);
}
export async function syncPendingMutations(data: AppData,userId: string,force = false): Promise<SyncResult> {
  if (!apiEnabled) return { synced: false,remaining: data.pendingMutations,message: 'Demo režim – server není připojený' };
  if (typeof globalThis.navigator?.onLine === 'boolean' && !globalThis.navigator.onLine) {
    return { synced: false,remaining: data.pendingMutations,message: 'Zařízení je offline' };
  }
  const mutations = data.pendingMutations.slice(0,500);
  try {
    const result = await apiRequest<ServerSnapshot & { acknowledged: string[] }>('/v1/sync',{
      method: 'POST',body: JSON.stringify({ mutations,revisions: data.remoteRevisions ?? {},force }),
    },userId);
    const acknowledged = new Set(result.acknowledged);
    const remaining = data.pendingMutations.filter((m) => !acknowledged.has(m.id));
    return { synced: true,remaining,syncedAt: result.syncedAt,
      message: remaining.length ? `${remaining.length} změn ještě čeká na odeslání` : 'Data jsou synchronizovaná',data: applyServerSnapshot(data,result),bootstrappedFor: userId };
  } catch (error) {
    return { synced: false,remaining: data.pendingMutations,conflict: error instanceof ApiError && error.code === 'SYNC_CONFLICT',
      message: error instanceof ApiError ? error.message : 'Server není dostupný. Změny zůstaly v zařízení.' };
  }
}
