import type {
  AppData,
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
    case 'rx_request':
      return { ...data, rxRequests: upsertById(data.rxRequests, mutation.payload as RxRequest) };
  }
}
