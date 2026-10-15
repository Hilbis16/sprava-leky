import { describe, expect, it } from 'vitest';

import { createDemoData } from '@/data/demo';
import { applyMutation } from './mutations';
import type { PendingMutation } from './types';

const mutation = (entity: PendingMutation['entity'], payload: unknown): PendingMutation => ({ id: entity, entity, payload, createdAt: '2026-10-15T08:00:00.000Z' });

describe('applyMutation', () => {
  it('přidá a přejmenuje osobu', () => {
    const data = createDemoData();
    const added = applyMutation(data, mutation('profile', { id: 'new', displayName: 'Marie', initials: 'M', color: '#2F6FB0', timezone: 'Europe/Prague' }));
    expect(added.profiles).toHaveLength(3);
    const renamed = applyMutation(added, mutation('profile', { ...added.profiles[2]!, displayName: 'Marie Nová' }));
    expect(renamed.profiles.map((item) => item.displayName)).toContain('Marie Nová');
    expect(renamed.profiles).toHaveLength(3);
  });

  it('odebere osobu se všemi jejími daty a přepne vybranou osobu', () => {
    const data = createDemoData();
    const jana = data.profiles[0]!.id;
    const removed = applyMutation(data, mutation('profile_remove', { id: jana }));
    expect(removed.profiles.map((item) => item.id)).not.toContain(jana);
    expect(removed.currentProfileId).toBe(data.profiles[1]!.id);
    expect(removed.medications.every((item) => item.profileId !== jana)).toBe(true);
    const remainingMedicationIds = new Set(removed.medications.map((item) => item.id));
    expect(removed.regimens.every((item) => remainingMedicationIds.has(item.medicationId))).toBe(true);
    expect(removed.inventoryEvents.every((item) => remainingMedicationIds.has(item.medicationId))).toBe(true);
    expect(removed.prescribers.every((item) => item.profileId !== jana)).toBe(true);
  });

  it('uloží a odebere kontakt', () => {
    const data = createDemoData();
    const pharmacy = { id: 'ph', profileId: data.profiles[0]!.id, kind: 'pharmacy' as const, name: 'Lékárna U Anděla' };
    const saved = applyMutation(data, mutation('prescriber', pharmacy));
    expect(saved.prescribers).toContainEqual(pharmacy);
    expect(applyMutation(saved, mutation('prescriber_remove', { id: 'ph' })).prescribers).not.toContainEqual(pharmacy);
  });
});
