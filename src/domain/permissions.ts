import type { AppData } from './types';

// Pouze pro nabídku ovládacích prvků; konečné oprávnění ověřuje API.
export function canEditProfile(data: AppData | null,accountId: string | undefined,profileId: string) {
  if (!accountId) return true;
  if (!data) return false;
  if (data.memberships.some((m) => m.profileId === profileId && m.userId === accountId && m.role !== 'senior')) return true;
  return !data.remoteRevisions?.[profileId] && data.pendingMutations.some((m) => m.entity === 'profile' && (m.payload as { id: string }).id === profileId);
}
