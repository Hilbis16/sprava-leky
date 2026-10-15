import { addLocalDays, formatCzechDate, localDateKey, occurrencesForRange, startOfLocalDay } from './schedule';
import type { CareProfile, DoseAction, DoseStatus, Medication, RegimenRule } from './types';

export interface HistoryEntry {
  medicationId: string;
  scheduledAt: string;
  amount: number;
  status: DoseStatus;
  /** False for an action that matches no current schedule (changed or ended regimen). */
  scheduled: boolean;
  due: boolean;
}

export type DayStatus = 'none' | 'pending' | 'complete' | 'partial' | 'missed';

export interface DayHistory {
  date: string;
  entries: HistoryEntry[];
  status: DayStatus;
}

export interface MedicationAdherence {
  medicationId: string;
  taken: number;
  skipped: number;
  unconfirmed: number;
}

function dayStatus(entries: HistoryEntry[]): DayStatus {
  const due = entries.filter((entry) => entry.due && entry.scheduled);
  if (!entries.some((entry) => entry.scheduled)) return 'none';
  if (!due.length) return 'pending';
  if (due.some((entry) => entry.status === 'unconfirmed')) return 'missed';
  if (due.every((entry) => entry.status === 'taken')) return 'complete';
  return 'partial';
}

/**
 * Day-by-day record for one person, oldest day first, ending today. Ended
 * medications keep their past (their regimen gets an end date), and recorded
 * actions that no longer match a schedule are still listed.
 */
export function doseHistory(
  medications: Medication[],
  regimens: RegimenRule[],
  actions: DoseAction[],
  profileId: string,
  days = 30,
  now = new Date(),
): DayHistory[] {
  const from = addLocalDays(startOfLocalDay(now), -(days - 1));
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const entries: HistoryEntry[] = medications
    .filter((medication) => medication.profileId === profileId)
    .flatMap((medication) => {
      const regimen = regimens.find((item) => item.medicationId === medication.id);
      if (!regimen) return [];
      return occurrencesForRange({ ...medication, active: true }, regimen, actions, from, to).map((occurrence) => ({
        medicationId: occurrence.medicationId, scheduledAt: occurrence.scheduledAt, amount: occurrence.amount,
        status: occurrence.status, scheduled: true, due: new Date(occurrence.scheduledAt) <= now,
      }));
    });
  const known = new Set(entries.map((entry) => `${entry.medicationId}:${entry.scheduledAt}`));
  for (const action of actions) {
    const at = new Date(action.scheduledAt);
    if (action.profileId !== profileId || at < from || at > to || known.has(`${action.medicationId}:${action.scheduledAt}`)) continue;
    entries.push({ medicationId: action.medicationId, scheduledAt: action.scheduledAt, amount: action.amount, status: action.status, scheduled: false, due: true });
  }

  const byDay = new Map<string, HistoryEntry[]>();
  for (let index = 0; index < days; index += 1) byDay.set(localDateKey(addLocalDays(from, index)), []);
  for (const entry of entries) byDay.get(localDateKey(new Date(entry.scheduledAt)))?.push(entry);
  return [...byDay.entries()].map(([date, dayEntries]) => {
    const sorted = dayEntries.sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt));
    return { date, entries: sorted, status: dayStatus(sorted) };
  });
}

export function adherenceByMedication(history: DayHistory[]): MedicationAdherence[] {
  const result = new Map<string, MedicationAdherence>();
  for (const entry of history.flatMap((day) => day.entries)) {
    if (!entry.due) continue;
    const item = result.get(entry.medicationId) ?? { medicationId: entry.medicationId, taken: 0, skipped: 0, unconfirmed: 0 };
    if (entry.status === 'taken') item.taken += 1;
    else if (entry.status === 'skipped') item.skipped += 1;
    else item.unconfirmed += 1;
    result.set(entry.medicationId, item);
  }
  return [...result.values()];
}

/** Plain-text overview a caregiver can share with the doctor. States facts only. */
export function historyReport(profile: CareProfile, medications: Medication[], history: DayHistory[]): string {
  const first = history[0]?.date;
  const last = history.at(-1)?.date;
  const lines = [
    `Přehled užívání léků – ${profile.displayName}`,
    first && last ? `Období: ${formatCzechDate(first)} – ${formatCzechDate(last)}` : '',
    '',
  ];
  for (const item of adherenceByMedication(history)) {
    const medication = medications.find((med) => med.id === item.medicationId);
    const total = item.taken + item.skipped + item.unconfirmed;
    lines.push(`${medication?.name ?? 'Lék'}${medication?.strength ? ` ${medication.strength}` : ''}: užito ${item.taken} z ${total}`
      + `${item.skipped ? `, vynecháno ${item.skipped}` : ''}${item.unconfirmed ? `, nepotvrzeno ${item.unconfirmed}` : ''}`);
  }
  lines.push('', 'Záznamy vycházejí z potvrzení v aplikaci Moje léky. Nepotvrzená dávka neznamená, že lék nebyl užit.');
  return lines.filter((line, index) => line !== '' || index > 1).join('\n');
}
