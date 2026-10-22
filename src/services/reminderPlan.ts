import { forecastMedication, stockAlertDates } from '@/domain/forecast';
import { addLocalDays, courseFinished, localDateKey, normalizeTime, scheduledDate, startOfLocalDay } from '@/domain/schedule';
import type { AppData, Medication, RegimenRule } from '@/domain/types';

// Společný rozpočet pro celý telefon, nikoli pro jednotlivé léky.
export const MAX_DOSE_REMINDERS = 56;
export const MAX_STOCK_REMINDERS = 8;
export type Reminder = { id: string; kind: 'dose' | 'stock'; at: Date } | {
  id: string; kind: 'dose'; weekday: number; hour: number; minute: number;
};
export interface ReminderPlan { reminders: Reminder[]; refreshBefore?: string }
export interface ReminderUpdate { supported: boolean; permissionGranted: boolean; refreshBefore?: string }

export function reminderRefreshDelay(now: Date,refreshBefore?: string): number {
  const midnight = startOfLocalDay(addLocalDays(now,1)).getTime()+1000;
  const deadline = refreshBefore ? new Date(refreshBefore).getTime()-60_000 : Infinity;
  return Math.max(5000,Math.min(midnight,deadline)-now.getTime());
}

const slot = (weekday: number,time: string) => `${weekday}:${time}`;

function nextDates(medication: Medication,regimen: RegimenRule,now: Date,covered: Set<string>): Date[] {
  if (!medication.active || regimen.asNeeded || courseFinished(regimen,now)) return [];
  const times = [...new Set(regimen.times.map((dose) => normalizeTime(dose.time)).filter((time): time is string => Boolean(time)))].sort();
  const days = new Set(regimen.daysOfWeek.filter((day) => day >= 0 && day <= 6 && Number.isInteger(day)));
  if (![...days].some((day) => times.some((time) => !covered.has(slot(day,time))))) return [];
  let cursor = startOfLocalDay(now);
  if (regimen.effectiveFrom > localDateKey(cursor)) cursor = new Date(`${regimen.effectiveFrom}T00:00:00`);
  const result = new Map<number,Date>();
  // I pro jedinou dávku týdně postačuje nalézt rozpočet + první vynechaný termín.
  for (let day = 0; day < (MAX_DOSE_REMINDERS + 2) * 7 && result.size <= MAX_DOSE_REMINDERS; day++,cursor = addLocalDays(cursor,1)) {
    if (regimen.endsOn && localDateKey(cursor) > regimen.endsOn) break;
    if (!days.has(cursor.getDay())) continue;
    for (const time of times) {
      if (covered.has(slot(cursor.getDay(),time))) continue;
      const at = scheduledDate(cursor,time);
      // Neexistující čas při přechodu na letní čas může splynout s jinou dávkou.
      if (at > now) result.set(at.getTime(),at);
    }
  }
  return [...result.values()];
}

export function buildReminderPlan(data: AppData,now = new Date()): ReminderPlan {
  const active = data.medications.flatMap((medication) => {
    const regimen = data.regimens.find((r) => r.medicationId === medication.id);
    return regimen && data.profiles.some((profile) => profile.id === medication.profileId) && medication.active && !regimen.asNeeded && !courseFinished(regimen,now) ? [{ medication,regimen }] : [];
  });
  const weekly = new Map<string,Reminder>();
  for (const { regimen } of active) {
    if (regimen.endsOn || regimen.effectiveFrom > localDateKey(now)) continue;
    for (const day of new Set(regimen.daysOfWeek)) for (const dose of regimen.times) {
      const time = normalizeTime(dose.time);
      if (!time || day < 0 || day > 6 || !Number.isInteger(day)) continue;
      const [hour,minute] = time.split(':').map(Number);
      const key = slot(day,time);
      weekly.set(key,{ id: `local-v2-dose-weekly-${key}`,kind: 'dose',weekday: day === 0 ? 1 : day+1,hour: hour!,minute: minute! });
    }
  }
  // Při velkém počtu různých časů je bezpečnější nejbližší společný plán
  // s viditelným termínem doplnění než potichu vynechat týdenní pravidla.
  const useWeekly = weekly.size < MAX_DOSE_REMINDERS;
  const covered = new Set(useWeekly ? weekly.keys() : []);
  const dates = new Map<number,Date>();
  for (const { medication,regimen } of active) {
    for (const at of nextDates(medication,regimen,now,covered)) dates.set(at.getTime(),at);
  }
  const sortedDates = [...dates.values()].sort((a,b) => a.getTime()-b.getTime());
  const available = MAX_DOSE_REMINDERS - (useWeekly ? weekly.size : 0);
  const reminders: Reminder[] = useWeekly ? [...weekly.values()] : [];
  for (const at of sortedDates.slice(0,available)) reminders.push({ id: `local-v2-dose-date-${at.getTime()}`,kind: 'dose',at });
  const omitted = sortedDates[available];

  const stockDates = new Map<number,Date>();
  for (const { medication,regimen } of active) {
    const { shortageAt } = forecastMedication(medication,regimen,data.inventoryEvents,data.doseActions,now);
    for (const at of stockAlertDates(shortageAt,data.notificationPreferences.stockThresholdDays,now)) stockDates.set(at.getTime(),at);
  }
  const sortedStock = [...stockDates.values()].sort((a,b) => a.getTime()-b.getTime());
  for (const at of sortedStock.slice(0,MAX_STOCK_REMINDERS)) reminders.push({ id: `local-v2-stock-${at.getTime()}`,kind: 'stock',at });
  const nextStock = sortedStock[MAX_STOCK_REMINDERS];
  const deadlines = [omitted,nextStock].filter((at): at is Date => Boolean(at));
  return { reminders,refreshBefore: deadlines.length ? new Date(Math.min(...deadlines.map((at) => at.getTime()))).toISOString() : undefined };
}
