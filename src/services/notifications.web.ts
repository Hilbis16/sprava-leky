import type { AppData, Medication, RegimenRule } from '@/domain/types';

export async function requestNotificationPermission(): Promise<boolean> {
  return false;
}

export async function scheduleMedicationReminders(_medication: Medication, _regimen: RegimenRule): Promise<void> {
  // Mobile builds schedule OS-level notifications. Web remains a preview target.
}

export async function registerPushDevice(): Promise<void> {
  // Remote push is only delivered to mobile devices.
}

export async function cancelMedicationReminders(_medicationId: string): Promise<void> {
  // Nothing is scheduled on web.
}

export async function scheduleStockAlerts(_data: AppData): Promise<void> {
  // The web preview shows stock warnings in the app only.
}

export function subscribeToNotificationRoutes(_navigate: (route: string) => void): () => void {
  return () => undefined;
}
