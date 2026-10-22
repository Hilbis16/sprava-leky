import { applyMutation } from '@/domain/mutations';
import type { AppData } from '@/domain/types';
import type { SyncResult } from './sync';

/**
 * Combines a finished sync with the state as it is now. The sync worked on a
 * snapshot, so anything recorded while it was running must survive: those
 * mutations stay queued and are replayed on top of the pulled cloud data.
 */
export function applySyncResult(current: AppData, sentMutationIds: ReadonlySet<string>, result: SyncResult): AppData {
  const recordedDuringSync = current.pendingMutations.filter((mutation) => !sentMutationIds.has(mutation.id));
  const pendingMutations = [...result.remaining, ...recordedDuringSync];

  const cloudBootstrappedFor = result.bootstrappedFor ?? current.cloudBootstrappedFor;

  if (!result.data) {
    return { ...current, pendingMutations, lastSyncedAt: result.syncedAt ?? current.lastSyncedAt, cloudBootstrappedFor };
  }

  const replayed = pendingMutations.reduce(applyMutation, result.data);
  const keepProfile = replayed.profiles.some((profile) => profile.id === current.currentProfileId);
  return {
    ...replayed,
    currentProfileId: keepProfile ? current.currentProfileId : replayed.currentProfileId,
    activeRole: replayed.profiles.length ? current.activeRole : 'caregiver',
    notificationPreferences: current.notificationPreferences,
    remoteRevisions: result.data.remoteRevisions,
    pendingMutations,
    lastSyncedAt: result.syncedAt ?? current.lastSyncedAt,
    cloudBootstrappedFor,
  };
}
