import type {
  AppData,
  CareProfile,
  DoseAction,
  InventoryEvent,
  Medication,
  PendingMutation,
  PrescriberContact,
  RegimenRule,
  RxRequest,
} from './types';

export interface MedicationPayload {
  medication: Medication;
  regimen: RegimenRule;
  inventory?: InventoryEvent;
}

export interface RemovePayload {
  id: string;
}

export interface DoseUndoPayload {
  occurrenceId: string;
  medicationId: string;
  profileId: string;
}

const upsertById = <T extends { id: string }>(items: T[], item: T): T[] =>
  items.some((existing) => existing.id === item.id)
    ? items.map((existing) => (existing.id === item.id ? item : existing))
    : [...items, item];

const appendOnce = <T extends { id: string }>(items: T[], item: T): T[] =>
  items.some((existing) => existing.id === item.id) ? items : [...items, item];

function removeProfile(data: AppData, profileId: string): AppData {
  const medicationIds = new Set(data.medications.filter((item) => item.profileId === profileId).map((item) => item.id));
  const profiles = data.profiles.filter((item) => item.id !== profileId);
  return {
    ...data,
    profiles,
    currentProfileId: data.currentProfileId === profileId ? profiles[0]?.id ?? '' : data.currentProfileId,
    memberships: data.memberships.filter((item) => item.profileId !== profileId),
    medications: data.medications.filter((item) => item.profileId !== profileId),
    regimens: data.regimens.filter((item) => !medicationIds.has(item.medicationId)),
    inventoryEvents: data.inventoryEvents.filter((item) => !medicationIds.has(item.medicationId)),
    doseActions: data.doseActions.filter((item) => item.profileId !== profileId),
    prescribers: data.prescribers.filter((item) => item.profileId !== profileId),
    rxRequests: data.rxRequests.filter((item) => item.profileId !== profileId),
  };
}

/**
 * Applies one queued mutation to local data. The same reducer is used when the
 * user acts and when local changes are replayed on top of freshly pulled cloud
 * data, so both paths always produce the same state.
 */
export function applyMutation(data: AppData, mutation: PendingMutation): AppData {
  switch (mutation.entity) {
    case 'dose_action': {
      const action = mutation.payload as DoseAction;
      return { ...data, doseActions: [...data.doseActions.filter((item) => item.occurrenceId !== action.occurrenceId), action] };
    }
    case 'dose_action_undo': {
      const { occurrenceId } = mutation.payload as DoseUndoPayload;
      return { ...data, doseActions: data.doseActions.filter((item) => item.occurrenceId !== occurrenceId) };
    }
    case 'inventory_event':
      return { ...data, inventoryEvents: appendOnce(data.inventoryEvents, mutation.payload as InventoryEvent) };
    case 'medication': {
      const { medication, regimen, inventory } = mutation.payload as MedicationPayload;
      return {
        ...data,
        medications: upsertById(data.medications, medication),
        regimens: [...data.regimens.filter((item) => item.medicationId !== medication.id), regimen],
        inventoryEvents: inventory ? appendOnce(data.inventoryEvents, inventory) : data.inventoryEvents,
      };
    }
    case 'prescriber':
      return { ...data, prescribers: upsertById(data.prescribers, mutation.payload as PrescriberContact) };
    case 'prescriber_remove': {
      const { id } = mutation.payload as RemovePayload;
      return { ...data, prescribers: data.prescribers.filter((item) => item.id !== id) };
    }
    case 'profile':
      return { ...data, profiles: upsertById(data.profiles, mutation.payload as CareProfile) };
    case 'profile_remove':
      return removeProfile(data, (mutation.payload as RemovePayload).id);
    case 'rx_request':
      return { ...data, rxRequests: upsertById(data.rxRequests, mutation.payload as RxRequest) };
  }
}
