import { addLocalDays, localDateKey } from '@/domain/schedule';
import { createId } from '@/domain/ids';
import type { AppData, DoseAction } from '@/domain/types';

const now = new Date();
const today = localDateKey(now);
const monthAgo = localDateKey(addLocalDays(now, -30));
const isoAt = (dateKey: string, hour: number) => new Date(`${dateKey}T${String(hour).padStart(2, '0')}:00:00`).toISOString();

export function createDemoData(): AppData {
  const janaProfileId = createId('profile');
  const karelProfileId = createId('profile');
  const atorvastatinId = createId('medication');
  const concorId = createId('medication');
  const magnesiumId = createId('medication');
  const godasalId = createId('medication');
  const yesterday = localDateKey(addLocalDays(now, -1));
  const yesterdayMorningId = `${atorvastatinId}:${isoAt(yesterday, 8)}`;
  const yesterdayAction: DoseAction = {
    id: createId('action'),
    occurrenceId: yesterdayMorningId,
    medicationId: atorvastatinId,
    profileId: janaProfileId,
    scheduledAt: isoAt(yesterday, 8),
    amount: 1,
    status: 'taken',
    recordedAt: isoAt(yesterday, 8),
    recordedBy: 'Demo pečující',
  };

  return {
    schemaVersion: 1,
    currentProfileId: janaProfileId,
    activeRole: 'caregiver',
    profiles: [
      { id: janaProfileId, displayName: 'Jana Nováková', initials: 'JN', color: '#147D64', timezone: 'Europe/Prague' },
      { id: karelProfileId, displayName: 'Karel Novák', initials: 'KN', color: '#B85C18', timezone: 'Europe/Prague' },
    ],
    memberships: [
      { id: createId('membership'), profileId: janaProfileId, userName: 'David', role: 'owner' },
      { id: createId('membership'), profileId: janaProfileId, userName: 'Jana', role: 'senior' },
      { id: createId('membership'), profileId: karelProfileId, userName: 'David', role: 'owner' },
    ],
    medications: [
      {
        id: atorvastatinId, profileId: janaProfileId, name: 'Atorvastatin', strength: '20 mg',
        packageSize: 90, unit: 'tablet', prescription: true, active: true, createdAt: isoAt(monthAgo, 8),
      },
      {
        id: concorId, profileId: janaProfileId, name: 'Concor', strength: '5 mg',
        packageSize: 30, unit: 'tablet', prescription: true, active: true, createdAt: isoAt(monthAgo, 8),
      },
      {
        id: magnesiumId, profileId: janaProfileId, name: 'Magnesium', strength: '375 mg',
        packageSize: 60, unit: 'tablet', prescription: false, active: true, createdAt: isoAt(monthAgo, 8),
      },
      {
        id: godasalId, profileId: karelProfileId, name: 'Godasal', strength: '100 mg',
        packageSize: 50, unit: 'tablet', prescription: true, active: true, createdAt: isoAt(monthAgo, 8),
      },
    ],
    regimens: [
      {
        id: createId('regimen'), medicationId: atorvastatinId, effectiveFrom: monthAgo,
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6], asNeeded: false,
        times: [{ id: 'dose_a_e', time: '20:00', amount: 1, period: 'evening' }],
      },
      {
        id: createId('regimen'), medicationId: concorId, effectiveFrom: monthAgo,
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6], asNeeded: false,
        times: [{ id: 'dose_c_m', time: '08:00', amount: 0.5, period: 'morning' }],
      },
      {
        id: createId('regimen'), medicationId: magnesiumId, effectiveFrom: monthAgo,
        daysOfWeek: [1, 3, 5], asNeeded: false,
        times: [{ id: 'dose_m_a', time: '14:00', amount: 1, period: 'afternoon' }],
      },
      {
        id: createId('regimen'), medicationId: godasalId, effectiveFrom: monthAgo,
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6], asNeeded: false,
        times: [{ id: 'dose_k_m', time: '08:00', amount: 1, period: 'morning' }],
      },
    ],
    inventoryEvents: [
      { id: createId('inventory'), medicationId: atorvastatinId, kind: 'initial', quantity: 90, occurredAt: isoAt(monthAgo, 7) },
      { id: createId('inventory'), medicationId: concorId, kind: 'initial', quantity: 30, occurredAt: isoAt(monthAgo, 7) },
      { id: createId('inventory'), medicationId: magnesiumId, kind: 'initial', quantity: 18, occurredAt: isoAt(monthAgo, 7) },
      { id: createId('inventory'), medicationId: godasalId, kind: 'initial', quantity: 50, occurredAt: isoAt(monthAgo, 7) },
    ],
    doseActions: [yesterdayAction],
    prescribers: [
      { id: createId('prescriber'), profileId: janaProfileId, name: 'MUDr. Eva Veselá', phone: '+420777123456', email: 'ordinace@example.cz' },
    ],
    rxRequests: [],
    pendingMutations: [],
    notificationPreferences: { missedDoseDelayMinutes: 120, stockThresholdDays: [14, 7] },
    lastSyncedAt: new Date().toISOString(),
  };
}

export const demoToday = today;
