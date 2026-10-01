import { describe, expect, it } from 'vitest';

import { createDemoData } from './demo';
import { mergeFamilySnapshots, type FamilySnapshot } from './mergeFamily';

describe('mergeFamilySnapshots', () => {
  it('nahradí cloudovou část profilu a zachová ostatní lokální profily', () => {
    const base = createDemoData();
    const profileId = base.profiles[0]!.id;
    const otherProfileId = base.profiles[1]!.id;
    const remoteMedicationId = '12345678-1234-4234-8234-123456789012';
    const snapshot: FamilySnapshot = {
      profile: { ...base.profiles[0]!, displayName: 'Aktualizovaná Jana' },
      memberships: [],
      medications: [{
        id: remoteMedicationId, profileId, name: 'Cloudový lék', packageSize: 20,
        unit: 'tablet', prescription: false, active: true, createdAt: new Date().toISOString(),
      }],
      regimens: [],
      inventoryEvents: [],
      doseActions: [],
      prescribers: [],
      rxRequests: [],
    };

    const merged = mergeFamilySnapshots(base, [snapshot]);

    expect(merged.profiles.find((item) => item.id === profileId)?.displayName).toBe('Aktualizovaná Jana');
    expect(merged.medications.filter((item) => item.profileId === profileId).map((item) => item.id)).toEqual([remoteMedicationId]);
    expect(merged.medications.some((item) => item.profileId === otherProfileId)).toBe(true);
    expect(merged.currentProfileId).toBe(profileId);
  });
});
