import type { AppData } from '@/domain/types';

export function createEmptyData(): AppData {
  return { schemaVersion: 1,currentProfileId: '',activeRole: 'caregiver',profiles: [],memberships: [],medications: [],regimens: [],inventoryEvents: [],doseActions: [],prescribers: [],rxRequests: [],pendingMutations: [],notificationPreferences: { missedDoseDelayMinutes: 120,stockThresholdDays: [14,7] } };
}
export const storageKey = (accountId?: string) => accountId ? `moje-leky:app-data:account-v1:${accountId}` : 'moje-leky:app-data:v1';
