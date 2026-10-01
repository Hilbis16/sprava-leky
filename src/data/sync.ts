import type { AppData } from '@/domain/types';
import { pullAccessibleFamilyData } from './invites';
import { cloudEnabled, ensureCloudSession, supabase } from './supabase';

export interface SyncResult {
  synced: boolean;
  remaining: AppData['pendingMutations'];
  syncedAt?: string;
  message: string;
  data?: AppData;
}

export async function syncPendingMutations(data: AppData): Promise<SyncResult> {
  if (!cloudEnabled || !supabase) {
    return { synced: false, remaining: data.pendingMutations, message: 'Demo režim – cloud není připojený' };
  }
  if (typeof globalThis.navigator?.onLine === 'boolean' && !globalThis.navigator.onLine) {
    return { synced: false, remaining: data.pendingMutations, message: 'Zařízení je offline' };
  }

  try {
    await ensureCloudSession();
  } catch (error) {
    return { synced: false, remaining: data.pendingMutations, message: error instanceof Error ? error.message : 'Přihlášení selhalo' };
  }

  for (const profile of data.profiles) {
    const { error } = await supabase.rpc('bootstrap_family_profile', {
      requested_id: profile.id,
      requested_name: profile.displayName,
    });
    if (error) return { synced: false, remaining: data.pendingMutations, message: error.message };
  }

  const bootstrapMutations: AppData['pendingMutations'] = [];
  for (const medication of data.medications) {
    const regimen = data.regimens.find((item) => item.medicationId === medication.id);
    const inventory = data.inventoryEvents.find((item) => item.medicationId === medication.id);
    if (regimen && inventory) {
      bootstrapMutations.push({
        id: `bootstrap-medication-${medication.id}`,
        entity: 'medication',
        payload: { medication, regimen, inventory },
        createdAt: medication.createdAt,
      });
    }
  }
  for (const action of data.doseActions) {
    bootstrapMutations.push({ id: `bootstrap-action-${action.id}`, entity: 'dose_action', payload: action, createdAt: action.recordedAt });
  }
  for (const prescriber of data.prescribers) {
    bootstrapMutations.push({ id: `bootstrap-prescriber-${prescriber.id}`, entity: 'prescriber', payload: prescriber, createdAt: new Date().toISOString() });
  }
  const queued = new Map(bootstrapMutations.map((mutation) => [mutation.id, mutation]));
  data.pendingMutations.forEach((mutation) => queued.set(mutation.id, mutation));

  const failed: AppData['pendingMutations'] = [];
  for (const mutation of queued.values()) {
    const { error } = await supabase.rpc('apply_mobile_mutation', {
      mutation_id: mutation.id,
      entity_name: mutation.entity,
      body: mutation.payload,
    });
    if (error) failed.push(mutation);
  }
  const syncedAt = new Date().toISOString();
  let pulledData: AppData | undefined;
  if (!failed.length) {
    try {
      pulledData = await pullAccessibleFamilyData({ ...data, pendingMutations: [], lastSyncedAt: syncedAt });
    } catch (error) {
      return {
        synced: true,
        remaining: [],
        syncedAt,
        message: `Změny byly odeslány, ale stažení rodinných dat selhalo: ${error instanceof Error ? error.message : 'neznámá chyba'}`,
      };
    }
  }
  return {
    synced: failed.length === 0,
    remaining: failed,
    syncedAt,
    message: failed.length ? `${failed.length} změn čeká na další pokus` : 'Všechny změny jsou synchronizované',
    data: pulledData,
  };
}
