import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { cloudEnabled, ensureCloudSession, supabase } from '@/data/supabase';
import type { Medication, RegimenRule } from '@/domain/types';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('medicine-reminders', {
      name: 'Připomenutí léků',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250],
      lightColor: '#147D64',
    });
  }
  const existing = await Notifications.getPermissionsAsync();
  const result = existing.granted ? existing : await Notifications.requestPermissionsAsync();
  return result.granted;
}

/**
 * Registers this device for caregiver alerts sent by the push-notifications
 * edge function. Needs the cloud and a real EAS project id in app.json.
 */
export async function registerPushDevice(): Promise<void> {
  if (!cloudEnabled || !supabase) return;
  const projectId: string | undefined = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId || projectId.startsWith('REPLACE_')) return;
  try {
    if (!(await requestNotificationPermission())) return;
    await ensureCloudSession();
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const { error } = await supabase.rpc('register_push_device', { push_token: token, device_platform: Platform.OS });
    if (error) throw error;
  } catch (error) {
    // Emulators have no push token; local reminders keep working without it.
    console.warn('Zařízení se nepodařilo zaregistrovat pro upozornění.', error);
  }
}

export async function cancelMedicationReminders(medicationId: string): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(scheduled
    .filter((request) => request.content.data?.medicationId === medicationId)
    .map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)));
}

export async function scheduleMedicationReminders(medication: Medication, regimen: RegimenRule): Promise<void> {
  await cancelMedicationReminders(medication.id);
  if (!medication.active || regimen.asNeeded) return;
  const allowed = await requestNotificationPermission();
  if (!allowed) return;

  for (const dose of regimen.times) {
    const [hour = 8, minute = 0] = dose.time.split(':').map(Number);
    for (const day of regimen.daysOfWeek) {
      await Notifications.scheduleNotificationAsync({
        content: {
          // The lock screen is visible to anyone nearby, so the text never names the medicine.
          title: 'Moje léky',
          body: 'Je čas na léky. Otevřete aplikaci a potvrďte dávku.',
          data: { medicationId: medication.id },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday: day === 0 ? 1 : day + 1,
          hour,
          minute,
          channelId: 'medicine-reminders',
        },
      });
    }
  }
}
