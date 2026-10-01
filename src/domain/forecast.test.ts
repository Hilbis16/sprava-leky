import { describe, expect, it } from 'vitest';

import { forecastMedication } from './forecast';
import type { InventoryEvent, Medication, RegimenRule } from './types';

const medication: Medication = {
  id: 'med', profileId: 'person', name: 'Testovací lék', packageSize: 90,
  unit: 'tablet', prescription: true, active: true, createdAt: '2026-01-01T00:00:00.000Z',
};
const event: InventoryEvent = { id: 'inv', medicationId: 'med', kind: 'initial', quantity: 90, occurredAt: '2026-01-01T05:00:00.000Z' };
const daily: RegimenRule = {
  id: 'reg', medicationId: 'med', effectiveFrom: '2026-01-01', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], asNeeded: false,
  times: [
    { id: 'morning', time: '08:00', amount: 1, period: 'morning' },
    { id: 'evening', time: '20:00', amount: 1, period: 'evening' },
  ],
};

describe('forecastMedication', () => {
  it('spočítá 90 tablet při 1-0-1 na 45 dní', () => {
    const now = new Date('2026-01-01T07:30:00');
    const result = forecastMedication(medication, daily, [event], [], now);
    expect(result.daysRemaining).toBe(45);
    expect(result.estimatedStock).toBe(90);
    expect(result.shortageAt).not.toBeNull();
  });

  it('odečte minulou nepotvrzenou dávku, ale ne explicitně vynechanou', () => {
    const now = new Date('2026-01-01T21:00:00');
    const first = forecastMedication(medication, daily, [event], [], now);
    expect(first.estimatedStock).toBe(88);
    expect(first.unconfirmedPastDoses).toBe(2);

    const skipped = [{
      id: 'a', occurrenceId: `med:${new Date('2026-01-01T08:00:00').toISOString()}`,
      medicationId: 'med', profileId: 'person', scheduledAt: new Date('2026-01-01T08:00:00').toISOString(),
      amount: 1, status: 'skipped' as const, recordedAt: now.toISOString(), recordedBy: 'test',
    }];
    const second = forecastMedication(medication, daily, [event], skipped, now);
    expect(second.estimatedStock).toBe(89);
    expect(second.unconfirmedPastDoses).toBe(1);
  });

  it('podporuje půl tablety a vybrané dny', () => {
    const regimen: RegimenRule = { ...daily, daysOfWeek: [1, 3, 5], times: [{ id: 'half', time: '08:00', amount: 0.5, period: 'morning' }] };
    const result = forecastMedication(medication, regimen, [{ ...event, quantity: 2 }], [], new Date('2026-01-01T07:00:00'));
    expect(result.estimatedStock).toBe(2);
    expect(result.shortageAt).not.toBeNull();
  });

  it('vrátí neznámý horizont pro lék dle potřeby', () => {
    const result = forecastMedication(medication, { ...daily, asNeeded: true }, [event], [], new Date('2026-01-01T07:00:00'));
    expect(result.daysRemaining).toBeNull();
    expect(result.shortageAt).toBeNull();
  });
});
