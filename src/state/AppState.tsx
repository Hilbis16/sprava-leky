import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { regimenChangeCorrectionQuantity, stockCorrectionQuantity } from '@/domain/forecast';
import { createId } from '@/domain/ids';
import { applyMutation, type MedicationPayload } from '@/domain/mutations';
import { localDateKey } from '@/domain/schedule';
import type { AppData, DoseOccurrence, InventoryEvent, MedicineDraft, PendingMutation, RegimenRule, RxRequestStatus } from '@/domain/types';
import { applySyncResult } from '@/data/applySync';
import { acceptFamilyInvite as acceptCloudFamilyInvite } from '@/data/invites';
import { loadAppData, resetAppData, saveAppData } from '@/data/localStore';
import { syncPendingMutations } from '@/data/sync';
// Metro selects notifications.native.ts or notifications.web.ts.
// eslint-disable-next-line import/no-unresolved
import { cancelMedicationReminders, scheduleMedicationReminders } from '@/services/notifications';

interface AppStateValue {
  data: AppData | null;
  ready: boolean;
  syncMessage: string;
  setCurrentProfile: (profileId: string) => void;
  setActiveRole: (role: 'caregiver' | 'senior') => void;
  recordDose: (occurrence: DoseOccurrence, status: 'taken' | 'skipped') => void;
  undoDose: (occurrence: DoseOccurrence) => void;
  addMedicine: (draft: MedicineDraft) => Promise<string>;
  updateMedicine: (medicationId: string, draft: MedicineDraft) => void;
  deactivateMedicine: (medicationId: string) => void;
  addStock: (medicationId: string, quantity: number) => void;
  correctStock: (medicationId: string, countedStock: number) => void;
  saveRxRequest: (input: { medicationId: string; message: string; channel: 'sms' | 'email' | 'share' }) => string;
  updateRxRequestStatus: (requestId: string, status: RxRequestStatus) => void;
  syncNow: () => Promise<void>;
  acceptFamilyInvite: (token: string) => Promise<void>;
  resetDemo: () => Promise<void>;
}

const AppStateContext = createContext<AppStateValue | undefined>(undefined);

const mutation = (entity: PendingMutation['entity'], payload: unknown): PendingMutation => ({
  id: createId('mutation'), entity, payload, createdAt: new Date().toISOString(),
});

const regimenTimes = (draft: MedicineDraft) => draft.times.map((time) => ({ ...time, id: createId('dose-time') }));

const sameSchedule = (regimen: RegimenRule | undefined, draft: MedicineDraft) => Boolean(regimen)
  && JSON.stringify([...regimen!.daysOfWeek].sort()) === JSON.stringify([...draft.daysOfWeek].sort())
  && JSON.stringify(regimen!.times.map(({ time, amount, period }) => ({ time, amount, period })))
    === JSON.stringify(draft.times.map(({ time, amount, period }) => ({ time, amount, period })));

export function AppStateProvider({ children }: React.PropsWithChildren) {
  const [data, setData] = useState<AppData | null>(null);
  const [syncMessage, setSyncMessage] = useState('Načítám data…');
  // Latest committed state for actions that must read it outside a render
  // (building payloads, sync). Kept in step with every setData call.
  const dataRef = useRef<AppData | null>(null);
  const syncingRef = useRef(false);

  const replaceData = useCallback((next: AppData) => {
    dataRef.current = next;
    setData(next);
  }, []);

  useEffect(() => {
    loadAppData().then((loaded) => {
      replaceData(loaded);
      setSyncMessage(loaded.pendingMutations.length ? `${loaded.pendingMutations.length} změn čeká` : 'Data jsou v zařízení');
    });
  }, [replaceData]);

  const update = useCallback((recipe: (current: AppData) => AppData) => {
    setData((current) => {
      if (!current) return current;
      const next = recipe(current);
      dataRef.current = next;
      void saveAppData(next);
      return next;
    });
  }, []);

  /** Applies mutations locally and queues them for the cloud. */
  const commit = useCallback((...mutations: PendingMutation[]) => {
    update((current) => ({
      ...mutations.reduce(applyMutation, current),
      pendingMutations: [...current.pendingMutations, ...mutations],
    }));
  }, [update]);

  const setCurrentProfile = useCallback((profileId: string) => update((current) => ({ ...current, currentProfileId: profileId })), [update]);
  const setActiveRole = useCallback((activeRole: 'caregiver' | 'senior') => update((current) => ({ ...current, activeRole })), [update]);

  const recordDose = useCallback((occurrence: DoseOccurrence, status: 'taken' | 'skipped') => {
    const role = dataRef.current?.activeRole;
    commit(mutation('dose_action', {
      id: createId('action'), occurrenceId: occurrence.id, medicationId: occurrence.medicationId,
      profileId: occurrence.profileId, scheduledAt: occurrence.scheduledAt, amount: occurrence.amount,
      status, recordedAt: new Date().toISOString(), recordedBy: role === 'senior' ? 'Senior' : 'Pečující',
    }));
  }, [commit]);

  const undoDose = useCallback((occurrence: DoseOccurrence) => {
    commit(mutation('dose_action_undo', { occurrenceId: occurrence.id, medicationId: occurrence.medicationId, profileId: occurrence.profileId }));
  }, [commit]);

  const addMedicine = useCallback(async (draft: MedicineDraft) => {
    const medicationId = createId('med');
    const payload: MedicationPayload = {
      medication: {
        id: medicationId, profileId: draft.profileId, name: draft.name.trim(), strength: draft.strength?.trim() || undefined,
        packageSize: draft.packageSize, unit: draft.unit, prescription: draft.prescription,
        ereceptId: draft.ereceptId, active: true, createdAt: new Date().toISOString(),
      },
      regimen: {
        id: createId('regimen'), medicationId, effectiveFrom: localDateKey(new Date()), daysOfWeek: draft.daysOfWeek,
        asNeeded: false, times: regimenTimes(draft),
      },
      inventory: { id: createId('inventory'), medicationId, kind: 'initial', quantity: draft.packageSize, occurredAt: new Date().toISOString() },
    };
    commit(mutation('medication', payload));
    void scheduleMedicationReminders(payload.medication, payload.regimen);
    return medicationId;
  }, [commit]);

  const updateMedicine = useCallback((medicationId: string, draft: MedicineDraft) => {
    const current = dataRef.current;
    const medication = current?.medications.find((item) => item.id === medicationId);
    if (!current || !medication) return;
    const previous = current.regimens.find((item) => item.medicationId === medicationId);
    const nextMedication = {
      ...medication, name: draft.name.trim(), strength: draft.strength?.trim() || undefined, packageSize: draft.packageSize,
      unit: draft.unit, prescription: draft.prescription, ereceptId: draft.ereceptId,
    };
    let regimen = previous;
    let inventory: InventoryEvent | undefined;
    if (!previous || !sameSchedule(previous, draft)) {
      // A new schedule applies from today; a correction keeps today's stock estimate unchanged.
      regimen = {
        id: previous?.id ?? createId('regimen'), medicationId, effectiveFrom: localDateKey(new Date()),
        daysOfWeek: draft.daysOfWeek, asNeeded: false, times: regimenTimes(draft),
      };
      const quantity = regimenChangeCorrectionQuantity(medication, previous, regimen, current.inventoryEvents, current.doseActions);
      if (quantity !== 0) {
        inventory = { id: createId('inventory'), medicationId, kind: 'correction', quantity, occurredAt: new Date().toISOString(), note: 'Změna dávkování' };
      }
    }
    commit(mutation('medication', { medication: nextMedication, regimen: regimen!, inventory } satisfies MedicationPayload));
    void scheduleMedicationReminders(nextMedication, regimen!);
  }, [commit]);

  const deactivateMedicine = useCallback((medicationId: string) => {
    const current = dataRef.current;
    const medication = current?.medications.find((item) => item.id === medicationId);
    const regimen = current?.regimens.find((item) => item.medicationId === medicationId);
    if (!medication || !regimen) return;
    commit(mutation('medication', { medication: { ...medication, active: false }, regimen } satisfies MedicationPayload));
    void cancelMedicationReminders(medicationId);
  }, [commit]);

  const addStock = useCallback((medicationId: string, quantity: number) => {
    commit(mutation('inventory_event', { id: createId('inventory'), medicationId, kind: 'refill', quantity, occurredAt: new Date().toISOString() } satisfies InventoryEvent));
  }, [commit]);

  const correctStock = useCallback((medicationId: string, countedStock: number) => {
    const current = dataRef.current;
    const medication = current?.medications.find((item) => item.id === medicationId);
    if (!current || !medication) return;
    const regimen = current.regimens.find((item) => item.medicationId === medicationId);
    const quantity = stockCorrectionQuantity(medication, regimen, current.inventoryEvents, current.doseActions, countedStock);
    if (quantity === 0) return;
    commit(mutation('inventory_event', {
      id: createId('inventory'), medicationId, kind: 'correction', quantity, occurredAt: new Date().toISOString(), note: 'Ruční přepočet',
    } satisfies InventoryEvent));
  }, [commit]);

  const saveRxRequest = useCallback((input: { medicationId: string; message: string; channel: 'sms' | 'email' | 'share' }) => {
    const id = createId('rx');
    const profileId = dataRef.current?.currentProfileId ?? '';
    commit(mutation('rx_request', { id, profileId, status: 'draft', createdAt: new Date().toISOString(), ...input }));
    return id;
  }, [commit]);

  const updateRxRequestStatus = useCallback((requestId: string, status: RxRequestStatus) => {
    const request = dataRef.current?.rxRequests.find((item) => item.id === requestId);
    if (!request) return;
    const now = new Date().toISOString();
    commit(mutation('rx_request', {
      ...request, status,
      sentAt: status === 'sent' ? now : request.sentAt,
      completedAt: status === 'completed' ? now : request.completedAt,
    }));
  }, [commit]);

  const syncNow = useCallback(async () => {
    const snapshot = dataRef.current;
    if (!snapshot || syncingRef.current) return;
    syncingRef.current = true;
    setSyncMessage('Synchronizuji…');
    try {
      const sentIds = new Set(snapshot.pendingMutations.map((item) => item.id));
      const result = await syncPendingMutations(snapshot);
      update((current) => applySyncResult(current, sentIds, result));
      setSyncMessage(result.message);
    } finally {
      syncingRef.current = false;
    }
  }, [update]);

  const acceptFamilyInvite = useCallback(async (token: string) => {
    const current = dataRef.current;
    if (!current) throw new Error('Data aplikace ještě nejsou připravená.');
    setSyncMessage('Připojuji rodinu…');
    const next = await acceptCloudFamilyInvite(token, current);
    replaceData(next);
    await saveAppData(next);
    setSyncMessage('Rodinný profil je připojený');
  }, [replaceData]);

  const resetDemo = useCallback(async () => {
    const fresh = await resetAppData();
    replaceData(fresh);
    setSyncMessage('Demo data byla obnovena');
  }, [replaceData]);

  const value = useMemo<AppStateValue>(() => ({
    data, ready: Boolean(data), syncMessage, setCurrentProfile, setActiveRole, recordDose, undoDose,
    addMedicine, updateMedicine, deactivateMedicine, addStock, correctStock, saveRxRequest, updateRxRequestStatus,
    syncNow, acceptFamilyInvite, resetDemo,
  }), [data, syncMessage, setCurrentProfile, setActiveRole, recordDose, undoDose, addMedicine, updateMedicine,
    deactivateMedicine, addStock, correctStock, saveRxRequest, updateRxRequestStatus, syncNow, acceptFamilyInvite, resetDemo]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateValue {
  const value = useContext(AppStateContext);
  if (!value) throw new Error('useAppState musí být uvnitř AppStateProvider.');
  return value;
}
