import type { DoseAction, DoseOccurrence, Medication, RegimenRule } from './types';

const pad = (value: number) => String(value).padStart(2, '0');

export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addLocalDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function scheduledDate(date: Date, time: string): Date {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes, 0, 0);
}

/** Accepts "8:00", "08.00" or "0800" and returns "08:00"; null for an invalid time. */
export function normalizeTime(raw: string): string | null {
  const match = raw.trim().match(/^(\d{1,2})[:.]?(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${pad(hours)}:${pad(minutes)}`;
}

export function occurrenceId(medicationId: string, scheduledAt: Date): string {
  return `${medicationId}:${scheduledAt.toISOString()}`;
}

export function occurrencesForRange(
  medication: Medication,
  regimen: RegimenRule,
  actions: DoseAction[],
  from: Date,
  to: Date,
): DoseOccurrence[] {
  if (!medication.active || regimen.asNeeded) return [];

  const actionByOccurrence = new Map(actions.map((action) => [action.occurrenceId, action]));
  const result: DoseOccurrence[] = [];
  let cursor = startOfLocalDay(from);
  const lastDay = startOfLocalDay(to);
  const effectiveFrom = new Date(`${regimen.effectiveFrom}T00:00:00`);

  while (cursor <= lastDay) {
    if (cursor >= effectiveFrom && regimen.daysOfWeek.includes(cursor.getDay())) {
      for (const doseTime of regimen.times) {
        const at = scheduledDate(cursor, doseTime.time);
        if (at < from || at > to) continue;
        const id = occurrenceId(medication.id, at);
        const action = actionByOccurrence.get(id);
        result.push({
          id,
          medicationId: medication.id,
          profileId: medication.profileId,
          scheduledAt: at.toISOString(),
          amount: doseTime.amount,
          period: doseTime.period,
          status: action?.status ?? 'unconfirmed',
          action,
        });
      }
    }
    cursor = addLocalDays(cursor, 1);
  }

  return result.sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt));
}

export function todayOccurrences(
  medications: Medication[],
  regimens: RegimenRule[],
  actions: DoseAction[],
  profileId: string,
  now = new Date(),
): DoseOccurrence[] {
  const from = startOfLocalDay(now);
  const to = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 23, 59, 59, 999);
  return medications
    .filter((medication) => medication.profileId === profileId && medication.active)
    .flatMap((medication) => {
      const regimen = regimens.find((item) => item.medicationId === medication.id);
      return regimen ? occurrencesForRange(medication, regimen, actions, from, to) : [];
    })
    .sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt));
}
