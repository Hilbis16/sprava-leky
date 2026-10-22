import type { AppData } from '@/domain/types';
import { applyMutation } from '@/domain/mutations';
import { apiRequest } from './api';
import { applyServerSnapshot, type ServerSnapshot } from './sync';

export type InviteRole = 'caregiver' | 'senior';
export interface FamilyInvite { token: string; expiresAt: string; url: string; role: InviteRole }
export async function createFamilyInvite(profileId: string, role: InviteRole, userId: string): Promise<FamilyInvite> {
  return apiRequest('/v1/invites',{ method: 'POST',body: JSON.stringify({ profileId,role }) },userId);
}
export async function acceptFamilyInvite(token: string,base: AppData,userId: string): Promise<AppData> {
  const result = await apiRequest<ServerSnapshot>('/v1/invites/accept',{ method: 'POST',body: JSON.stringify({ token }) },userId);
  const remote = applyServerSnapshot(base,result);
  return { ...base.pendingMutations.reduce(applyMutation,remote),pendingMutations: base.pendingMutations };
}
