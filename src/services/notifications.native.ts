import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { cloudEnabled, ensureCloudSession, supabase } from '@/data/supabase';
import { forecastMedication, stockAlertDates } from '@/domain/forecast';
import { courseFinished } from '@/domain/schedule';
import type { AppData, Medication, RegimenRule } from '@/domain/types';

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

let lastStockSignature = '';

/**
 * Schedules "running out" reminders (by default 14 and 7 days ahead) for every
 * active medicine. Several medicines on one day share one generic reminder.
 * Never asks for permission itself; it runs in the background after changes.
 */
export async function scheduleStockAlerts(data: AppData, now = new Date()): Promise<void> {
  const moments = new Set<number>();
  for (const medication of data.medications) {
    const regimen = data.regimens.find((item) => item.medicationId === medication.id);
    if (!medication.active || courseFinished(regimen, now)) continue;
    const { shortageAt } = forecastMedication(medication, regimen, data.inventoryEvents, data.doseActions, now);
    stockAlertDates(shortageAt, data.notificationPreferences.stockThresholdDays, now).forEach((at) => moments.add(at.getTime()));
  }
  const signature = [...moments].sort().join(',');
  if (signature === lastStockSignature) return;
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) return;
  lastStockSignature = signature;

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(scheduled
    .filter((request) => request.content.data?.kind === 'stock')
    .map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)));
  for (const at of moments) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Moje léky',
        body: 'Některý lék brzy dojde. Otevřete aplikaci a zkontrolujte zásoby.',
        data: { kind: 'stock', route: '/(tabs)/stock' },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(at), channelId: 'medicine-reminders' },
    });
  }
}

/** Opens the screen a tapped notification points to, also after a cold start. */
export function subscribeToNotificationRoutes(navigate: (route: string) => void): () => void {
  const open = (response: Notifications.NotificationResponse | null) => {
    const route = response?.notification.request.content.data?.route;
    if (typeof route === 'string' && route.startsWith('/')) navigate(route);
  };
  void Notifications.getLastNotificationResponseAsync().then(open);
  const subscription = Notifications.addNotificationResponseReceivedListener(open);
  return () => subscription.remove();
}
