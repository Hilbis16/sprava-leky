import type { Medication, RegimenRule } from '@/domain/types';

export async function requestNotificationPermission(): Promise<boolean> {
  return false;
}

export async function scheduleMedicationReminders(_medication: Medication, _regimen: RegimenRule): Promise<void> {
  // Mobile builds schedule OS-level notifications. Web remains a preview target.
}
