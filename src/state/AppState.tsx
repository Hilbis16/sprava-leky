import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { createId } from '@/domain/ids';
import { localDateKey } from '@/domain/schedule';
import type { AppData, DoseOccurrence, MedicineDraft, RxRequestStatus } from '@/domain/types';
import { acceptFamilyInvite as acceptCloudFamilyInvite } from '@/data/invites';
import { loadAppData, resetAppData, saveAppData } from '@/data/localStore';
import { syncPendingMutations } from '@/data/sync';
// Metro selects notifications.native.ts or notifications.web.ts.
// eslint-disable-next-line import/no-unresolved
import { scheduleMedicationReminders } from '@/services/notifications';

interface AppStateValue {
  data: AppData | null;
  ready: boolean;
  syncMessage: string;
  setCurrentProfile: (profileId: string) => void;
  setActiveRole: (role: 'caregiver' | 'senior') => void;
  recordDose: (occurrence: DoseOccurrence, status: 'taken' | 'skipped') => void;
  addMedicine: (draft: MedicineDraft) => Promise<string>;
  addStock: (medicationId: string, quantity: number) => void;
  saveRxRequest: (input: { medicationId: string; message: string; channel: 'sms' | 'email' | 'share' }) => string;
  updateRxRequestStatus: (requestId: string, status: RxRequestStatus) => void;
  syncNow: () => Promise<void>;
  acceptFamilyInvite: (token: string) => Promise<void>;
  resetDemo: () => Promise<void>;
}

const AppStateContext = createContext<AppStateValue | undefined>(undefined);

export function AppStateProvider({ children }: React.PropsWithChildren) {
  const [data, setData] = useState<AppData | null>(null);
  const [syncMessage, setSyncMessage] = useState('Načítám data…');

  useEffect(() => {
    loadAppData().then((loaded) => {
      setData(loaded);
      setSyncMessage(loaded.pendingMutations.length ? `${loaded.pendingMutations.length} změn čeká` : 'Data jsou v zařízení');
    });
  }, []);

  const update = useCallback((recipe: (current: AppData) => AppData) => {
    setData((current) => {
      if (!current) return current;
      const next = recipe(current);
      void saveAppData(next);
      return next;
    });
  }, []);

  const setCurrentProfile = useCallback((profileId: string) => update((current) => ({ ...current, currentProfileId: profileId })), [update]);
  const setActiveRole = useCallback((activeRole: 'caregiver' | 'senior') => update((current) => ({ ...current, activeRole })), [update]);

  const recordDose = useCallback((occurrence: DoseOccurrence, status: 'taken' | 'skipped') => {
    update((current) => {
      const action = {
        id: createId('action'), occurrenceId: occurrence.id, medicationId: occurrence.medicationId,
        profileId: occurrence.profileId, scheduledAt: occurrence.scheduledAt, amount: occurrence.amount,
        status, recordedAt: new Date().toISOString(), recordedBy: current.activeRole === 'senior' ? 'Senior' : 'Pečující',
      } as const;
      return {
        ...current,
        doseActions: [...current.doseActions.filter((item) => item.occurrenceId !== occurrence.id), action],
        pendingMutations: [...current.pendingMutations, { id: createId('mutation'), entity: 'dose_action', payload: action, createdAt: new Date().toISOString() }],
      };
    });
  }, [update]);

  const addMedicine = useCallback(async (draft: MedicineDraft) => {
    const medicationId = createId('med');
    const regimenId = createId('regimen');
    const medication = {
      id: medicationId, profileId: draft.profileId, name: draft.name.trim(), strength: draft.strength?.trim(),
      packageSize: draft.packageSize, unit: draft.unit, prescription: draft.prescription,
      ereceptId: draft.ereceptId, active: true, createdAt: new Date().toISOString(),
    } as const;
    const regimen = {
      id: regimenId, medicationId, effectiveFrom: localDateKey(new Date()), daysOfWeek: draft.daysOfWeek,
      asNeeded: false,
      times: draft.times.map((time) => ({ ...time, id: createId('dose-time') })),
    };
    const inventory = {
      id: createId('inventory'), medicationId, kind: 'initial' as const,
      quantity: draft.packageSize, occurredAt: new Date().toISOString(),
    };
    update((current) => ({
      ...current,
      medications: [...current.medications, medication],
      regimens: [...current.regimens, regimen],
      inventoryEvents: [...current.inventoryEvents, inventory],
      pendingMutations: [...current.pendingMutations, {
        id: createId('mutation'), entity: 'medication', payload: { medication, regimen, inventory }, createdAt: new Date().toISOString(),
      }],
    }));
    void scheduleMedicationReminders(medication, regimen);
    return medicationId;
  }, [update]);

  const addStock = useCallback((medicationId: string, quantity: number) => {
    update((current) => {
      const event = { id: createId('inventory'), medicationId, kind: 'refill' as const, quantity, occurredAt: new Date().toISOString() };
      return {
        ...current,
        inventoryEvents: [...current.inventoryEvents, event],
        pendingMutations: [...current.pendingMutations, { id: createId('mutation'), entity: 'inventory_event', payload: event, createdAt: new Date().toISOString() }],
      };
    });
  }, [update]);

  const saveRxRequest = useCallback((input: { medicationId: string; message: string; channel: 'sms' | 'email' | 'share' }) => {
    const id = createId('rx');
    update((current) => {
      const request = { id, profileId: current.currentProfileId, status: 'draft' as const, createdAt: new Date().toISOString(), ...input };
      return {
        ...current,
        rxRequests: [...current.rxRequests, request],
        pendingMutations: [...current.pendingMutations, { id: createId('mutation'), entity: 'rx_request', payload: request, createdAt: new Date().toISOString() }],
      };
    });
    return id;
  }, [update]);

  const updateRxRequestStatus = useCallback((requestId: string, status: RxRequestStatus) => {
    update((current) => {
      let changed: AppData['rxRequests'][number] | undefined;
      const rxRequests = current.rxRequests.map((request) => {
        if (request.id !== requestId) return request;
        changed = {
        ...request, status,
        sentAt: status === 'sent' ? new Date().toISOString() : request.sentAt,
        completedAt: status === 'completed' ? new Date().toISOString() : request.completedAt,
        };
        return changed;
      });
      return {
        ...current,
        rxRequests,
        pendingMutations: changed ? [...current.pendingMutations, {
          id: createId('mutation'), entity: 'rx_request', payload: changed, createdAt: new Date().toISOString(),
        }] : current.pendingMutations,
      };
    });
  }, [update]);

  const syncNow = useCallback(async () => {
    if (!data) return;
    setSyncMessage('Synchronizuji…');
    const result = await syncPendingMutations(data);
    update((current) => result.data ?? ({ ...current, pendingMutations: result.remaining, lastSyncedAt: result.syncedAt ?? current.lastSyncedAt }));
    setSyncMessage(result.message);
  }, [data, update]);

  const acceptFamilyInvite = useCallback(async (token: string) => {
    if (!data) throw new Error('Data aplikace ještě nejsou připravená.');
    setSyncMessage('Připojuji rodinu…');
    const next = await acceptCloudFamilyInvite(token, data);
    setData(next);
    await saveAppData(next);
    setSyncMessage('Rodinný profil je připojený');
  }, [data]);

  const resetDemo = useCallback(async () => {
    const fresh = await resetAppData();
    setData(fresh);
    setSyncMessage('Demo data byla obnovena');
  }, []);

  const value = useMemo<AppStateValue>(() => ({
    data, ready: Boolean(data), syncMessage, setCurrentProfile, setActiveRole, recordDose,
    addMedicine, addStock, saveRxRequest, updateRxRequestStatus, syncNow, acceptFamilyInvite, resetDemo,
  }), [data, syncMessage, setCurrentProfile, setActiveRole, recordDose, addMedicine, addStock, saveRxRequest, updateRxRequestStatus, syncNow, acceptFamilyInvite, resetDemo]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateValue {
  const value = useContext(AppStateContext);
  if (!value) throw new Error('useAppState musí být uvnitř AppStateProvider.');
  return value;
}
