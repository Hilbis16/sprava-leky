import { addLocalDays, occurrencesForRange, startOfLocalDay } from './schedule';
import type {
  DoseAction,
  ForecastResult,
  InventoryEvent,
  Medication,
  RegimenRule,
} from './types';

const roundQuantity = (value: number) => Math.round((value + Number.EPSILON) * 2) / 2;

/**
 * Calculates inventory conservatively: every scheduled past dose consumes stock
 * unless it was explicitly marked skipped. Future occurrences are then walked one
 * by one, which keeps weekly schedules and DST changes correct.
 */
export function forecastMedication(
  medication: Medication,
  regimen: RegimenRule | undefined,
  inventoryEvents: InventoryEvent[],
  doseActions: DoseAction[],
  now = new Date(),
  horizonDays = 730,
): ForecastResult {
  const totalAdded = inventoryEvents
    .filter((event) => event.medicationId === medication.id && new Date(event.occurredAt) <= now)
    .reduce((total, event) => total + event.quantity, 0);

  if (!regimen || regimen.asNeeded) {
    return {
      estimatedStock: roundQuantity(totalAdded),
      lastCoveredAt: null,
      shortageAt: null,
      daysRemaining: null,
      unconfirmedPastDoses: 0,
    };
  }

  const start = new Date(`${regimen.effectiveFrom}T00:00:00`);
  const pastOccurrences = occurrencesForRange(medication, regimen, doseActions, start, now);
  let unconfirmedPastDoses = 0;
  const consumed = pastOccurrences.reduce((total, occurrence) => {
    if (occurrence.status === 'skipped') return total;
    if (occurrence.status === 'unconfirmed') unconfirmedPastDoses += 1;
    return total + occurrence.amount;
  }, 0);

  let stock = roundQuantity(Math.max(0, totalAdded - consumed));
  const futureEnd = addLocalDays(startOfLocalDay(now), horizonDays);
  const future = occurrencesForRange(
    medication,
    regimen,
    doseActions,
    new Date(now.getTime() + 1),
    futureEnd,
  );
  let lastCoveredAt: string | null = null;
  let shortageAt: string | null = null;

  for (const occurrence of future) {
    if (stock + Number.EPSILON < occurrence.amount) {
      shortageAt = occurrence.scheduledAt;
      break;
    }
    stock = roundQuantity(stock - occurrence.amount);
    lastCoveredAt = occurrence.scheduledAt;
  }

  const daysRemaining = shortageAt
    ? Math.max(0, Math.round((startOfLocalDay(new Date(shortageAt)).getTime() - startOfLocalDay(now).getTime()) / 86_400_000))
    : null;

  return {
    estimatedStock: roundQuantity(Math.max(0, totalAdded - consumed)),
    lastCoveredAt,
    shortageAt,
    daysRemaining,
    unconfirmedPastDoses,
  };
}

/** Quantity of a correction event that makes the estimated stock equal to a counted amount. */
export function stockCorrectionQuantity(
  medication: Medication,
  regimen: RegimenRule | undefined,
  inventoryEvents: InventoryEvent[],
  doseActions: DoseAction[],
  countedStock: number,
  now = new Date(),
): number {
  const { estimatedStock } = forecastMedication(medication, regimen, inventoryEvents, doseActions, now);
  return roundQuantity(countedStock - estimatedStock);
}

/**
 * A changed regimen starts today, so past doses of the old schedule would stop
 * being counted. The returned correction keeps today's estimated stock unchanged.
 */
export function regimenChangeCorrectionQuantity(
  medication: Medication,
  previous: RegimenRule | undefined,
  next: RegimenRule,
  inventoryEvents: InventoryEvent[],
  doseActions: DoseAction[],
  now = new Date(),
): number {
  const before = forecastMedication(medication, previous, inventoryEvents, doseActions, now).estimatedStock;
  return stockCorrectionQuantity(medication, next, inventoryEvents, doseActions, before, now);
}

/**
 * Moments (09:00 local) when the stock is `thresholds` days from running out.
 * Only future moments are returned; past ones are covered by in-app warnings.
 */
export function stockAlertDates(shortageAt: string | null, thresholds: number[], now = new Date()): Date[] {
  if (!shortageAt) return [];
  const shortageDay = startOfLocalDay(new Date(shortageAt));
  return thresholds
    .map((days) => {
      const at = addLocalDays(shortageDay, -days);
      at.setHours(9, 0, 0, 0);
      return at;
    })
    .filter((at) => at > now)
    .sort((left, right) => left.getTime() - right.getTime());
}

export function forecastTone(daysRemaining: number | null): 'safe' | 'warning' | 'critical' | 'unknown' {
  if (daysRemaining === null) return 'unknown';
  if (daysRemaining <= 7) return 'critical';
  if (daysRemaining <= 14) return 'warning';
  return 'safe';
}
