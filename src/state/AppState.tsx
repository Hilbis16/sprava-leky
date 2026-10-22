import { showMessage } from '@/components/message';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState as AppLifecycle } from 'react-native';
import { canEditProfile as mayEdit } from '@/domain/permissions';

import { regimenChangeCorrectionQuantity, stockCorrectionQuantity } from '@/domain/forecast';
import { createId } from '@/domain/ids';
import { applyMutation, type MedicationPayload } from '@/domain/mutations';
import { countedStockSchema, mutationSchema, validationMessage } from '@/domain/validation';
import { addLocalDays, localDateKey } from '@/domain/schedule';
import type {
  AppData, CareProfile, DoseOccurrence, InventoryEvent, MedicineDraft, PendingMutation, PrescriberContact, RegimenRule, RxRequestStatus,
} from '@/domain/types';
import { applySyncResult } from '@/data/applySync';
import { acceptFamilyInvite as acceptCloudFamilyInvite } from '@/data/invites';
import { loadAppData, resetAppData, saveAppData } from '@/data/localStore';
import { apiEnabled } from '@/data/api';
import { syncPendingMutations, fetchServerSnapshot, bootstrapMutations } from '@/data/sync';
import { useAuth } from './AuthState';
import { useLocalReminders } from './useLocalReminders';
import { runInviteAcceptance } from './acceptInvite';
// Metro selects notifications.native.ts or notifications.web.ts.
// eslint-disable-next-line import/no-unresolved
import { registerPushDevice } from '@/services/notifications';

const SYNC_AFTER_CHANGE_MS = 3_000;
const SYNC_RETRY_MS = 60_000;

interface AppStateValue {
  data: AppData | null;
  ready: boolean;
  loadError: boolean;
  retryLoad: () => void;
  syncMessage: string;
  canEditProfile: (profileId: string) => boolean;
  reminderWarning?: string;
  reminderRefreshBefore?: string;
  refreshReminders: (askPermission?: boolean) => Promise<void>;
  setCurrentProfile: (profileId: string) => void;
  setActiveRole: (role: 'caregiver' | 'senior') => void;
  recordDose: (occurrence: DoseOccurrence, status: 'taken' | 'skipped') => void;
  undoDose: (occurrence: DoseOccurrence) => void;
  addMedicine: (draft: MedicineDraft) => Promise<string>;
  updateMedicine: (medicationId: string, draft: MedicineDraft) => boolean;
  deactivateMedicine: (medicationId: string) => void;
  saveProfile: (input: { id?: string; displayName: string; color: string }) => string;
  removeProfile: (profileId: string) => void;
  saveContact: (input: Omit<PrescriberContact, 'id'> & { id?: string }) => boolean;
  removeContact: (contactId: string) => void;
  addStock: (medicationId: string, quantity: number) => boolean;
  correctStock: (medicationId: string, countedStock: number) => boolean;
  saveRxRequest: (input: { medicationId: string; message: string; channel: 'sms' | 'email' | 'share' }) => string;
  updateRxRequestStatus: (requestId: string, status: RxRequestStatus) => void;
  syncNow: (mode?: 'normal' | 'force' | 'discard') => Promise<void>;
  syncConflict: boolean;
  importLocalData: () => Promise<void>;
  acceptFamilyInvite: (token: string) => Promise<void>;
  resetDemo: () => Promise<void>;
}

const AppStateContext = createContext<AppStateValue | undefined>(undefined);

const mutation = (entity: PendingMutation['entity'], payload: unknown): PendingMutation => ({
  id: createId('mutation'), entity, payload, createdAt: new Date().toISOString(),
});

const regimenTimes = (draft: MedicineDraft) => draft.times.map((time) => ({ ...time, id: createId('dose-time') }));

const initialsFor = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2)
  .map((part) => part[0]!.toLocaleUpperCase('cs-CZ')).join('') || '?';

const sameSchedule = (regimen: RegimenRule | undefined, draft: MedicineDraft) => Boolean(regimen)
  && (regimen!.endsOn ?? null) === (draft.endsOn ?? null)
  && JSON.stringify([...regimen!.daysOfWeek].sort()) === JSON.stringify([...draft.daysOfWeek].sort())
  && JSON.stringify(regimen!.times.map(({ time, amount, period }) => ({ time, amount, period })))
    === JSON.stringify(draft.times.map(({ time, amount, period }) => ({ time, amount, period })));

export function AppStateProvider({ children }: React.PropsWithChildren) {
  const { user } = useAuth();
  const accountId = user?.id;
  const [syncConflict,setSyncConflict] = useState(false);
  const [loadError,setLoadError] = useState(false);
  const [loadAttempt,setLoadAttempt] = useState(0);
  const retryLoad = useCallback(() => { setLoadError(false); setLoadAttempt((value) => value + 1); },[]);
  const [data, setData] = useState<AppData | null>(null);
  const { reminderWarning,reminderRefreshBefore,refreshReminders } = useLocalReminders(data);
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
    loadAppData(accountId).then((loaded) => {
      replaceData(loaded);
      setSyncMessage(loaded.pendingMutations.length ? `${loaded.pendingMutations.length} změn čeká` : 'Data jsou v zařízení');
    }).catch(() => { setLoadError(true); setSyncMessage('Uložená data nelze načíst. Zachovejte úložiště pro obnovu.'); });
  }, [replaceData,accountId,loadAttempt]);

  const update = useCallback((recipe: (current: AppData) => AppData) => {
    setData((current) => {
      if (!current) return current;
      const next = recipe(current);
      dataRef.current = next;
      void saveAppData(next,accountId).catch(() => setSyncMessage('Změny se nepodařilo uložit do zařízení. Aplikaci zatím nezavírejte.'));
      return next;
    });
  }, [accountId]);

  /** Applies mutations locally and queues them for the cloud. */
  const commit = useCallback((...mutations: PendingMutation[]) => {
    const current = dataRef.current;
    if (!current) return false;
    // Ověřit celou dávku před reducerem i frontou; stejný kontrakt používá API.
    const parsed = mutationSchema.array().safeParse(mutations);
    if (!parsed.success) {
      showMessage('Změnu nelze uložit', validationMessage(parsed.error));
      return false;
    }
    if (current && accountId && mutations.some((item) => {
      if (['dose_action','dose_action_undo','profile_remove'].includes(item.entity)) return false;
      const p = item.payload as { id?: string;profileId?: string;medicationId?: string;medication?: { profileId: string } };
      if (item.entity === 'profile' && !current.profiles.some((profile) => profile.id === p.id)) return false;
      const profileId = item.entity === 'profile' ? p.id : p.medication?.profileId ?? p.profileId
        ?? current.medications.find((m) => m.id === p.medicationId)?.profileId ?? current.prescribers.find((contact) => contact.id === p.id)?.profileId;
      return !profileId || !mayEdit(current,accountId,profileId);
    })) {
      showMessage('Úprava není povolená','Tuto změnu může provést pouze vlastník nebo pečující.');
      return false;
    }
    update((current) => ({
      ...parsed.data.reduce(applyMutation, current),
      pendingMutations: [...current.pendingMutations, ...parsed.data],
    }));
    return true;
  }, [update,accountId]);
  const canEditProfile = useCallback((profileId: string) => mayEdit(data,accountId,profileId),[data,accountId]);

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
        ereceptId: draft.ereceptId, note: draft.note?.trim() || undefined, active: true, createdAt: new Date().toISOString(),
      },
      regimen: {
        id: createId('regimen'), medicationId, effectiveFrom: localDateKey(new Date()), daysOfWeek: draft.daysOfWeek,
        asNeeded: false, times: regimenTimes(draft), endsOn: draft.endsOn,
      },
      inventory: { id: createId('inventory'), medicationId, kind: 'initial', quantity: draft.packageSize, occurredAt: new Date().toISOString() },
    };
    if (!commit(mutation('medication', payload))) return '';
    void refreshReminders(true);
    return medicationId;
  }, [commit,refreshReminders]);

  const updateMedicine = useCallback((medicationId: string, draft: MedicineDraft) => {
    const current = dataRef.current;
    const medication = current?.medications.find((item) => item.id === medicationId);
    if (!current || !medication) return false;
    const previous = current.regimens.find((item) => item.medicationId === medicationId);
    const nextMedication = {
      ...medication, name: draft.name.trim(), strength: draft.strength?.trim() || undefined, packageSize: draft.packageSize,
      unit: draft.unit, prescription: draft.prescription, ereceptId: draft.ereceptId, note: draft.note?.trim() || undefined,
    };
    let regimen = previous;
    let inventory: InventoryEvent | undefined;
    if (!previous || !sameSchedule(previous, draft)) {
      // A new schedule applies from today; a correction keeps today's stock estimate unchanged.
      regimen = {
        id: previous?.id ?? createId('regimen'), medicationId, effectiveFrom: localDateKey(new Date()),
        daysOfWeek: draft.daysOfWeek, asNeeded: false, times: regimenTimes(draft), endsOn: draft.endsOn,
      };
      const quantity = regimenChangeCorrectionQuantity(medication, previous, regimen, current.inventoryEvents, current.doseActions);
      if (quantity !== 0) {
        inventory = { id: createId('inventory'), medicationId, kind: 'correction', quantity, occurredAt: new Date().toISOString(), note: 'Změna dávkování' };
      }
    }
    if (!commit(mutation('medication', { medication: nextMedication, regimen: regimen!, inventory } satisfies MedicationPayload))) return false;
    void refreshReminders(true);
    return true;
  }, [commit,refreshReminders]);

  const deactivateMedicine = useCallback((medicationId: string) => {
    const current = dataRef.current;
    const medication = current?.medications.find((item) => item.id === medicationId);
    const regimen = current?.regimens.find((item) => item.medicationId === medicationId);
    if (!medication || !regimen) return;
    // Ending the regimen yesterday keeps the past in the history without
    // inventing missed doses afterwards; today's records stay as unscheduled.
    const yesterday = localDateKey(addLocalDays(new Date(), -1));
    const endsOn = regimen.endsOn && regimen.endsOn < yesterday ? regimen.endsOn : yesterday;
    if (!commit(mutation('medication', { medication: { ...medication, active: false }, regimen: { ...regimen, endsOn } } satisfies MedicationPayload))) return;
  }, [commit]);

  const saveProfile = useCallback((input: { id?: string; displayName: string; color: string }) => {
    const existing = dataRef.current?.profiles.find((item) => item.id === input.id);
    const displayName = input.displayName.trim();
    const profile: CareProfile = {
      id: existing?.id ?? createId('profile'), displayName, initials: initialsFor(displayName), color: input.color, timezone: 'Europe/Prague',
    };
    if (!commit(mutation('profile', profile))) return '';
    if (!existing) update((current) => ({ ...current, currentProfileId: profile.id }));
    return profile.id;
  }, [commit, update]);

  const removeProfile = useCallback((profileId: string) => {
    const current = dataRef.current;
    if (!current || current.profiles.length <= 1) return;
    commit(mutation('profile_remove', { id: profileId }));
  }, [commit]);

  const saveContact = useCallback((input: Omit<PrescriberContact, 'id'> & { id?: string }) => {
    return commit(mutation('prescriber', {
      ...input, id: input.id ?? createId('prescriber'), name: input.name.trim(),
      phone: input.phone?.trim() || undefined, email: input.email?.trim() || undefined,
    } satisfies PrescriberContact));
  }, [commit]);

  const removeContact = useCallback((contactId: string) => {
    commit(mutation('prescriber_remove', { id: contactId }));
  }, [commit]);

  const addStock = useCallback((medicationId: string, quantity: number) => {
    return commit(mutation('inventory_event', { id: createId('inventory'), medicationId, kind: 'refill', quantity, occurredAt: new Date().toISOString() } satisfies InventoryEvent));
  }, [commit]);

  const correctStock = useCallback((medicationId: string, countedStock: number) => {
    const parsed = countedStockSchema.safeParse(countedStock);
    if (!parsed.success) {
      showMessage('Zkontrolujte počet', validationMessage(parsed.error));
      return false;
    }
    const current = dataRef.current;
    const medication = current?.medications.find((item) => item.id === medicationId);
    if (!current || !medication) return false;
    const regimen = current.regimens.find((item) => item.medicationId === medicationId);
    const quantity = stockCorrectionQuantity(medication, regimen, current.inventoryEvents, current.doseActions, countedStock);
    if (quantity === 0) return true;
    return commit(mutation('inventory_event', {
      id: createId('inventory'), medicationId, kind: 'correction', quantity, occurredAt: new Date().toISOString(), note: 'Ruční přepočet',
    } satisfies InventoryEvent));
  }, [commit]);

  const saveRxRequest = useCallback((input: { medicationId: string; message: string; channel: 'sms' | 'email' | 'share' }) => {
    const id = createId('rx');
    const profileId = dataRef.current?.currentProfileId ?? '';
    if (!commit(mutation('rx_request', { id, profileId, status: 'draft', createdAt: new Date().toISOString(), ...input }))) return '';
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

  const syncNow = useCallback(async (mode: 'normal' | 'force' | 'discard' = 'normal') => {
    const snapshot = dataRef.current;
    if (!snapshot || syncingRef.current || !accountId) return;
    syncingRef.current = true;
    setSyncMessage('Synchronizuji…');
    try {
      if (mode === 'discard') {
        const pulled = await fetchServerSnapshot(snapshot,accountId);
        const stillPending = dataRef.current?.pendingMutations.filter((m) => !snapshot.pendingMutations.some((sent) => sent.id === m.id)) ?? [];
        const next = { ...stillPending.reduce(applyMutation,pulled),pendingMutations: stillPending,cloudBootstrappedFor: accountId };
        replaceData(next); await saveAppData(next,accountId); setSyncConflict(false); setSyncMessage('Načtena data ze serveru.');
        return;
      }
      const sentIds = new Set(snapshot.pendingMutations.map((item) => item.id));
      const result = await syncPendingMutations(snapshot,accountId,mode === 'force');
      update((current) => applySyncResult(current, sentIds, result));
      setSyncConflict(Boolean(result.conflict));
      setSyncMessage(result.message);
    } catch { setSyncMessage('Server není dostupný. Změny zůstaly v zařízení.');
    } finally {
      syncingRef.current = false;
    }
  }, [update,accountId,replaceData]);

  const ready = Boolean(data);
  useEffect(() => {
    if (!apiEnabled || !accountId || !ready) return;
    void syncNow();
    void registerPushDevice(accountId);
    const subscription = AppLifecycle.addEventListener('change', (state) => {
      if (state === 'active') void syncNow();
    });
    return () => subscription.remove();
  }, [ready, syncNow,accountId]);

  const pendingCount = data?.pendingMutations.length ?? 0;
  useEffect(() => {
    if (!apiEnabled || !accountId || pendingCount === 0 || syncConflict) return;
    const soon = setTimeout(() => void syncNow(), SYNC_AFTER_CHANGE_MS);
    const retry = setInterval(() => void syncNow(), SYNC_RETRY_MS);
    return () => { clearTimeout(soon); clearInterval(retry); };
  }, [pendingCount, syncNow,accountId,syncConflict]);

  const importLocalData = useCallback(async () => {
    if (!accountId || !dataRef.current) throw new Error('Nejprve se přihlaste.');
    if (dataRef.current.profiles.length || dataRef.current.pendingMutations.length) throw new Error('Původní data lze přenést pouze do prázdného účtu.');
    const remote = await fetchServerSnapshot(dataRef.current,accountId);
    if (remote.profiles.length) throw new Error('Tento účet už obsahuje rodinná data. Původní kopie nebyla změněna.');
    const local = await loadAppData();
    if (dataRef.current.profiles.length || dataRef.current.pendingMutations.length) throw new Error('Data se mezitím změnila. Přenos nebyl spuštěn.');
    const next = { ...local,cloudBootstrappedFor: accountId,remoteRevisions: {},pendingMutations: bootstrapMutations(local,accountId) };
    replaceData(next); await saveAppData(next,accountId); await syncNow();
  },[accountId,replaceData,syncNow]);

  const acceptFamilyInvite = useCallback((token: string) => runInviteAcceptance(token, accountId, {
    getData: () => dataRef.current, replaceData, setMessage: setSyncMessage,
    receive: acceptCloudFamilyInvite, save: saveAppData,
  }), [replaceData,accountId]);

  const resetDemo = useCallback(async () => {
    if (accountId) return;
    const fresh = await resetAppData();
    replaceData(fresh);
    setSyncMessage('Demo data byla obnovena');
  }, [replaceData,accountId]);

  const value = useMemo<AppStateValue>(() => ({
    data, ready, loadError, retryLoad, syncMessage, canEditProfile, reminderWarning, reminderRefreshBefore, refreshReminders, setCurrentProfile, setActiveRole, recordDose, undoDose,
    addMedicine, updateMedicine, deactivateMedicine, saveProfile, removeProfile, saveContact, removeContact, addStock, correctStock, saveRxRequest, updateRxRequestStatus,
    syncNow, syncConflict, importLocalData, acceptFamilyInvite, resetDemo,
  }), [data, ready, loadError, retryLoad, syncMessage, canEditProfile, reminderWarning, reminderRefreshBefore, refreshReminders, setCurrentProfile, setActiveRole, recordDose, undoDose, addMedicine, updateMedicine,
    deactivateMedicine, saveProfile, removeProfile, saveContact, removeContact, addStock, correctStock, saveRxRequest, updateRxRequestStatus, syncNow, syncConflict, importLocalData, acceptFamilyInvite, resetDemo]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateValue {
  const value = useContext(AppStateContext);
  if (!value) throw new Error('useAppState musí být uvnitř AppStateProvider.');
  return value;
}
