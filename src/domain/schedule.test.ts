import { describe, expect, it } from 'vitest';
import { occurrencesForRange } from './schedule';
import type { Medication, RegimenRule } from './types';

const med: Medication = { id: 'm', profileId: 'p', name: 'Lék', packageSize: 10, unit: 'tablet', prescription: false, active: true, createdAt: '2026-01-01T00:00:00Z' };

describe('occurrencesForRange', () => {
  it('vytvoří jen dávky ve vybrané dny', () => {
    const regimen: RegimenRule = { id: 'r', medicationId: 'm', effectiveFrom: '2026-08-10', daysOfWeek: [1, 3, 5], asNeeded: false, times: [{ id: 't', time: '08:00', amount: 1, period: 'morning' }] };
    const result = occurrencesForRange(med, regimen, [], new Date('2026-08-10T00:00:00'), new Date('2026-08-16T23:59:59'));
    expect(result).toHaveLength(3);
    expect(result.every((item) => [1, 3, 5].includes(new Date(item.scheduledAt).getDay()))).toBe(true);
  });
});
