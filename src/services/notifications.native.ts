import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

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

export async function scheduleMedicationReminders(medication: Medication, regimen: RegimenRule): Promise<void> {
  const allowed = await requestNotificationPermission();
  if (!allowed || regimen.asNeeded) return;

  for (const dose of regimen.times) {
    const [hour = 8, minute = 0] = dose.time.split(':').map(Number);
    for (const day of regimen.daysOfWeek) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Je čas na léky',
          body: `Zkontrolujte dnešní dávku: ${medication.name}`,
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
