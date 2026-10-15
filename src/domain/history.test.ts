import { describe, expect, it } from 'vitest';

import { adherenceByMedication, doseHistory, historyReport } from './history';
import type { CareProfile, DoseAction, Medication, RegimenRule } from './types';

const profile: CareProfile = { id: 'p', displayName: 'Jana Nováková', initials: 'JN', color: '#147D64', timezone: 'Europe/Prague' };
const med: Medication = { id: 'm', profileId: 'p', name: 'Concor', strength: '5 mg', packageSize: 30, unit: 'tablet', prescription: true, active: true, createdAt: '2026-01-01T00:00:00Z' };
const regimen: RegimenRule = {
  id: 'r', medicationId: 'm', effectiveFrom: '2026-03-01', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], asNeeded: false,
  times: [{ id: 'a', time: '08:00', amount: 1, period: 'morning' }, { id: 'b', time: '20:00', amount: 1, period: 'evening' }],
};
const action = (date: string, time: string, status: 'taken' | 'skipped'): DoseAction => {
  const scheduledAt = new Date(`${date}T${time}:00`).toISOString();
  return { id: `${date}${time}`, occurrenceId: `m:${scheduledAt}`, medicationId: 'm', profileId: 'p', scheduledAt, amount: 1, status, recordedAt: scheduledAt, recordedBy: 'test' };
};

describe('doseHistory', () => {
  const now = new Date('2026-03-03T12:00:00');
  const actions = [
    action('2026-03-01', '08:00', 'taken'), action('2026-03-01', '20:00', 'taken'),
    action('2026-03-02', '08:00', 'taken'), action('2026-03-02', '20:00', 'skipped'),
    action('2026-03-03', '08:00', 'taken'),
  ];

  it('určí stav každého dne', () => {
    const history = doseHistory([med], [regimen], actions, 'p', 4, now);
    expect(history.map((day) => [day.date, day.status])).toEqual([
      ['2026-02-28', 'none'], ['2026-03-01', 'complete'], ['2026-03-02', 'partial'], ['2026-03-03', 'complete'],
    ]);
    expect(history.at(-1)!.entries.map((entry) => entry.due)).toEqual([true, false]);
  });

  it('označí den s nepotvrzenou minulou dávkou jako zmeškaný', () => {
    const history = doseHistory([med], [regimen], actions.slice(0, 4), 'p', 1, now);
    expect(history[0]!.status).toBe('missed');
  });

  it('zachová historii ukončeného léku a záznamy mimo rozpis', () => {
    const ended = { ...regimen, endsOn: '2026-03-01' };
    const history = doseHistory([{ ...med, active: false }], [ended], actions, 'p', 3, now);
    expect(history.map((day) => day.date)).toEqual(['2026-03-01', '2026-03-02', '2026-03-03']);
    expect(history[0]!.status).toBe('complete');
    const march2 = history[1]!;
    expect(march2.entries.every((entry) => !entry.scheduled)).toBe(true);
    expect(march2.status).toBe('none');
  });

  it('spočítá souhrn a připraví text pro lékaře', () => {
    const history = doseHistory([med], [regimen], actions, 'p', 3, now);
    expect(adherenceByMedication(history)).toEqual([{ medicationId: 'm', taken: 4, skipped: 1, unconfirmed: 0 }]);
    const report = historyReport(profile, [med], history);
    expect(report).toContain('Jana Nováková');
    expect(report).toContain('Concor 5 mg: užito 4 z 5, vynecháno 1');
    expect(report).toContain('1. 3. 2026 – 3. 3. 2026');
  });
});
