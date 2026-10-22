import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { apiEnabled, apiRequest } from '@/data/api';
import type { AppData } from '@/domain/types';
import { buildReminderPlan, type ReminderUpdate } from './reminderPlan';

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
 * Registruje zařízení pro upozornění z vlastního serverového workeru.
 * Vyžaduje přihlášení a skutečné Expo projectId v app.json.
 */
export async function registerPushDevice(accountId: string): Promise<void> {
  if (!apiEnabled) return;
  const projectId: string | undefined = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId || projectId.startsWith('REPLACE_')) return;
  try {
    if (!(await requestNotificationPermission())) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await apiRequest('/v1/devices',{ method: 'POST',body: JSON.stringify({ pushToken: token,platform: Platform.OS }) },accountId);
  } catch (error) {
    // Emulators have no push token; local reminders keep working without it.
    console.warn('Zařízení se nepodařilo zaregistrovat pro upozornění.', error);
  }
}

let changes: Promise<unknown> = Promise.resolve();
let requestedVersion = 0;

/** Aktualizuje společný plán a odstraní i staré neomezené připomínky kúry. */
export function reconcileLocalReminders(data: AppData,now = new Date()): Promise<ReminderUpdate | undefined> {
  const version = ++requestedVersion;
  const next = changes.catch(() => undefined).then(async () => {
    if (version !== requestedVersion) return;
    const plan = buildReminderPlan(data,now);
    const wanted = new Set(plan.reminders.map((reminder) => reminder.id));
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const existing = new Set<string>();
    for (const request of scheduled) {
      const kind = request.content.data?.kind;
      const managed = kind === 'dose' || kind === 'stock' || typeof request.content.data?.medicationId === 'string'
        || request.identifier.startsWith('local-v2-');
      if (!managed) continue;
      if (!wanted.has(request.identifier)) await Notifications.cancelScheduledNotificationAsync(request.identifier);
      else existing.add(request.identifier);
    }
    const permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) {
      for (const identifier of existing) await Notifications.cancelScheduledNotificationAsync(identifier);
      return { supported: true,permissionGranted: false };
    }
    if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('medicine-reminders',{
      name: 'Připomenutí léků',importance: Notifications.AndroidImportance.HIGH,vibrationPattern: [0,250,150,250],lightColor: '#147D64',
    });
    for (const reminder of plan.reminders) {
      if (version !== requestedVersion) return;
      if (existing.has(reminder.id)) continue;
      await Notifications.scheduleNotificationAsync({
        identifier: reminder.id,
        content: {
          title: 'Moje léky',
          body: reminder.kind === 'dose' ? 'Je čas na léky. Otevřete aplikaci a potvrďte dávku.' : 'Některý lék brzy dojde. Otevřete aplikaci a zkontrolujte zásoby.',
          data: { kind: reminder.kind,route: reminder.kind === 'dose' ? '/(tabs)' : '/(tabs)/stock' },
        },
        trigger: 'at' in reminder
          ? { type: Notifications.SchedulableTriggerInputTypes.DATE,date: reminder.at,channelId: 'medicine-reminders' }
          : { type: Notifications.SchedulableTriggerInputTypes.WEEKLY,weekday: reminder.weekday,hour: reminder.hour,minute: reminder.minute,channelId: 'medicine-reminders' },
      });
    }
    return { supported: true,permissionGranted: true,refreshBefore: plan.refreshBefore };
  });
  changes = next;
  return next;
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
