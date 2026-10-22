import type { AppData } from '@/domain/types';
import type { ReminderUpdate } from './reminderPlan';

export async function requestNotificationPermission(): Promise<boolean> {
  return false;
}

export async function registerPushDevice(_accountId: string): Promise<void> {
  // Remote push is only delivered to mobile devices.
}

export async function reconcileLocalReminders(_data: AppData,_now = new Date()): Promise<ReminderUpdate | undefined> {
  return { supported: false,permissionGranted: false };
}

export function subscribeToNotificationRoutes(_navigate: (route: string) => void): () => void {
  return () => undefined;
}
