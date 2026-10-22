import type {
  AppData,
  CareProfile,
  DoseAction,
  InventoryEvent,
  Medication,
  Membership,
  PrescriberContact,
  RegimenRule,
  RxRequest,
} from '@/domain/types';
import { createEmptyData } from './empty';

export interface FamilySnapshot {
  profile: CareProfile;
  memberships: Membership[];
  medications: Medication[];
  regimens: RegimenRule[];
  inventoryEvents: InventoryEvent[];
  doseActions: DoseAction[];
  prescribers: PrescriberContact[];
  rxRequests: RxRequest[];
}

/** The server is authoritative, including revoked memberships and deleted profiles. */
export function replaceFamilySnapshots(base: AppData, snapshots: FamilySnapshot[]): AppData {
  const remote = mergeFamilySnapshots(createEmptyData(),snapshots);
  return { ...remote,currentProfileId: remote.profiles.some((p) => p.id === base.currentProfileId) ? base.currentProfileId : remote.currentProfileId,
    activeRole: base.activeRole,notificationPreferences: base.notificationPreferences,cloudBootstrappedFor: base.cloudBootstrappedFor };
}

export function mergeFamilySnapshots(base: AppData, snapshots: FamilySnapshot[]): AppData {
  if (!snapshots.length) return base;
  const profileIds = new Set(snapshots.map((snapshot) => snapshot.profile.id));
  const replacedMedicationIds = new Set(base.medications.filter((item) => profileIds.has(item.profileId)).map((item) => item.id));
  const merged = {
    ...base,
    profiles: [...base.profiles.filter((item) => !profileIds.has(item.id)), ...snapshots.map((item) => item.profile)],
    memberships: [...base.memberships.filter((item) => !profileIds.has(item.profileId)), ...snapshots.flatMap((item) => item.memberships)],
    medications: [...base.medications.filter((item) => !profileIds.has(item.profileId)), ...snapshots.flatMap((item) => item.medications)],
    regimens: [...base.regimens.filter((item) => !replacedMedicationIds.has(item.medicationId)), ...snapshots.flatMap((item) => item.regimens)],
    inventoryEvents: [...base.inventoryEvents.filter((item) => !replacedMedicationIds.has(item.medicationId)), ...snapshots.flatMap((item) => item.inventoryEvents)],
    doseActions: [...base.doseActions.filter((item) => !profileIds.has(item.profileId)), ...snapshots.flatMap((item) => item.doseActions)],
    prescribers: [...base.prescribers.filter((item) => !profileIds.has(item.profileId)), ...snapshots.flatMap((item) => item.prescribers)],
    rxRequests: [...base.rxRequests.filter((item) => !profileIds.has(item.profileId)), ...snapshots.flatMap((item) => item.rxRequests)],
  };
  const currentProfileId = merged.profiles.some((item) => item.id === base.currentProfileId)
    ? base.currentProfileId
    : snapshots[0]!.profile.id;
  return { ...merged, currentProfileId };
}
