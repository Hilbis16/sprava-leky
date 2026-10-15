import { describe, expect, it } from 'vitest';
import { courseFinished, formatCzechDate, normalizeTime, occurrencesForRange, parseCzechDate } from './schedule';
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

describe('normalizeTime', () => {
  it('sjednotí běžné zápisy času', () => {
    expect(normalizeTime('8:00')).toBe('08:00');
    expect(normalizeTime('07.30')).toBe('07:30');
    expect(normalizeTime('2115')).toBe('21:15');
  });

  it('odmítne neplatný čas', () => {
    expect(normalizeTime('24:00')).toBeNull();
    expect(normalizeTime('12:60')).toBeNull();
    expect(normalizeTime('ráno')).toBeNull();
  });
});

describe('konec léčby a data', () => {
  it('nevytvoří dávky po posledním dni léčby', () => {
    const regimen: RegimenRule = { id: 'r', medicationId: 'm', effectiveFrom: '2026-08-10', endsOn: '2026-08-12', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], asNeeded: false, times: [{ id: 't', time: '08:00', amount: 1, period: 'morning' }] };
    const result = occurrencesForRange(med, regimen, [], new Date('2026-08-10T00:00:00'), new Date('2026-08-16T23:59:59'));
    expect(result).toHaveLength(3);
    expect(courseFinished(regimen, new Date('2026-08-12T23:00:00'))).toBe(false);
    expect(courseFinished(regimen, new Date('2026-08-13T00:30:00'))).toBe(true);
  });

  it('převede české datum a odmítne neexistující den', () => {
    expect(parseCzechDate('1. 2. 2026')).toBe('2026-02-01');
    expect(parseCzechDate('31.12.2026')).toBe('2026-12-31');
    expect(parseCzechDate('30.2.2026')).toBeNull();
    expect(formatCzechDate('2026-02-01')).toBe('1. 2. 2026');
  });
});
