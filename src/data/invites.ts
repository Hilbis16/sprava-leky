import type {
  AppData,
  DoseAction,
  DoseTime,
  InventoryEvent,
  Medication,
  Membership,
  RxRequest,
} from '@/domain/types';

import { mergeFamilySnapshots, type FamilySnapshot } from './mergeFamily';
import { cloudEnabled, ensureCloudSession, supabase } from './supabase';

export type InviteRole = 'caregiver' | 'senior';

export interface FamilyInvite {
  token: string;
  expiresAt: string;
  url: string;
  role: InviteRole;
}

interface ProfileRow { id: string; display_name: string; timezone: string }
interface MembershipRow { id: string; profile_id: string; role: Membership['role'] }
interface MedicationRow {
  id: string; profile_id: string; name: string; strength: string | null; package_size: number;
  unit: Medication['unit']; prescription: boolean; erecept_id: string | null; sukl_code: string | null;
  active: boolean; created_at: string;
}
interface RegimenRow {
  id: string; medication_id: string; effective_from: string; days_of_week: number[];
  times: DoseTime[]; as_needed: boolean;
}
interface InventoryRow {
  id: string; medication_id: string; kind: InventoryEvent['kind']; quantity: number;
  occurred_at: string; note: string | null;
}
interface DoseActionRow {
  id: string; occurrence_id: string; medication_id: string; profile_id: string;
  scheduled_at: string; amount: number; status: DoseAction['status']; recorded_at: string;
}
interface PrescriberRow { id: string; profile_id: string; name: string; phone: string | null; email: string | null }
interface RxRequestRow {
  id: string; profile_id: string; medication_id: string; status: RxRequest['status'];
  channel: RxRequest['channel']; message: string; created_at: string; sent_at: string | null;
  completed_at: string | null;
}

function initialsFor(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'ML';
}

function throwFirstError(results: { error: { message: string } | null }[]) {
  const failed = results.find((result) => result.error);
  if (failed?.error) throw new Error(failed.error.message);
}

export async function createFamilyInvite(profileId: string, role: InviteRole): Promise<FamilyInvite> {
  if (!cloudEnabled || !supabase) throw new Error('Nejprve připojte Supabase cloud.');
  await ensureCloudSession();
  const { data, error } = await supabase.rpc('create_family_invite', {
    target_profile: profileId,
    invited_role: role,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as { token: string; expires_at: string } | null;
  if (!row?.token) throw new Error('Pozvánku se nepodařilo vytvořit.');
  return {
    token: row.token,
    expiresAt: row.expires_at,
    url: `mojeleky://invite/${encodeURIComponent(row.token)}`,
    role,
  };
}

async function fetchFamilySnapshot(profileId: string): Promise<FamilySnapshot> {
  if (!supabase) throw new Error('Cloud není připojený.');
  const profileResult = await supabase.from('care_profiles').select('id, display_name, timezone').eq('id', profileId).single();
  if (profileResult.error) throw profileResult.error;
  const profileRow = profileResult.data as ProfileRow;
  const medicationResult = await supabase.from('medications').select('*').eq('profile_id', profileId);
  if (medicationResult.error) throw medicationResult.error;
  const medicationRows = (medicationResult.data ?? []) as MedicationRow[];
  const medicationIds = medicationRows.map((row) => row.id);

  const emptyRelated = { data: [], error: null };
  const [membershipsResult, actionsResult, prescribersResult, requestsResult, regimensResult, inventoryResult] = await Promise.all([
    supabase.from('memberships').select('id, profile_id, role').eq('profile_id', profileId),
    supabase.from('dose_actions').select('*').eq('profile_id', profileId),
    supabase.from('prescriber_contacts').select('*').eq('profile_id', profileId),
    supabase.from('rx_requests').select('*').eq('profile_id', profileId),
    medicationIds.length ? supabase.from('regimen_rules').select('*').in('medication_id', medicationIds) : Promise.resolve(emptyRelated),
    medicationIds.length ? supabase.from('inventory_events').select('*').in('medication_id', medicationIds) : Promise.resolve(emptyRelated),
  ]);
  throwFirstError([membershipsResult, actionsResult, prescribersResult, requestsResult, regimensResult, inventoryResult]);

  const memberships = (membershipsResult.data ?? []) as MembershipRow[];
  const actions = (actionsResult.data ?? []) as DoseActionRow[];
  const prescribers = (prescribersResult.data ?? []) as PrescriberRow[];
  const requests = (requestsResult.data ?? []) as RxRequestRow[];
  const regimens = (regimensResult.data ?? []) as RegimenRow[];
  const inventory = (inventoryResult.data ?? []) as InventoryRow[];

  return {
    profile: {
      id: profileRow.id,
      displayName: profileRow.display_name,
      initials: initialsFor(profileRow.display_name),
      color: '#147D64',
      timezone: 'Europe/Prague',
    },
    memberships: memberships.map((row) => ({ id: row.id, profileId: row.profile_id, role: row.role, userName: 'Člen rodiny' })),
    medications: medicationRows.map((row) => ({
      id: row.id, profileId: row.profile_id, name: row.name, strength: row.strength ?? undefined,
      packageSize: Number(row.package_size), unit: row.unit, prescription: row.prescription,
      ereceptId: row.erecept_id ?? undefined, suklCode: row.sukl_code ?? undefined,
      active: row.active, createdAt: row.created_at,
    })),
    regimens: regimens.map((row) => ({
      id: row.id, medicationId: row.medication_id, effectiveFrom: row.effective_from,
      daysOfWeek: row.days_of_week, times: row.times, asNeeded: row.as_needed,
    })),
    inventoryEvents: inventory.map((row) => ({
      id: row.id, medicationId: row.medication_id, kind: row.kind, quantity: Number(row.quantity),
      occurredAt: row.occurred_at, note: row.note ?? undefined,
    })),
    doseActions: actions.map((row) => ({
      id: row.id, occurrenceId: row.occurrence_id, medicationId: row.medication_id,
      profileId: row.profile_id, scheduledAt: row.scheduled_at, amount: Number(row.amount),
      status: row.status, recordedAt: row.recorded_at, recordedBy: 'Člen rodiny',
    })),
    prescribers: prescribers.map((row) => ({
      id: row.id, profileId: row.profile_id, name: row.name,
      phone: row.phone ?? undefined, email: row.email ?? undefined,
    })),
    rxRequests: requests.map((row) => ({
      id: row.id, profileId: row.profile_id, medicationId: row.medication_id,
      status: row.status, channel: row.channel, message: row.message, createdAt: row.created_at,
      sentAt: row.sent_at ?? undefined, completedAt: row.completed_at ?? undefined,
    })),
  };
}

export async function pullAccessibleFamilyData(base: AppData): Promise<AppData> {
  if (!supabase) return base;
  await ensureCloudSession();
  const { data, error } = await supabase.from('memberships').select('profile_id');
  if (error) throw error;
  const profileIds = [...new Set(((data ?? []) as { profile_id: string }[]).map((row) => row.profile_id))];
  const snapshots = await Promise.all(profileIds.map(fetchFamilySnapshot));
  return mergeFamilySnapshots(base, snapshots);
}

export async function acceptFamilyInvite(token: string, base: AppData): Promise<AppData> {
  if (!cloudEnabled || !supabase) throw new Error('Nejprve připojte Supabase cloud.');
  await ensureCloudSession();
  const { error } = await supabase.rpc('accept_family_invite', { raw_token: token });
  if (error) throw error;
  return pullAccessibleFamilyData(base);
}
