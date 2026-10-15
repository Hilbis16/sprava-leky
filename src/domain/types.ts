export type Role = 'owner' | 'caregiver' | 'senior';
export type DoseUnit = 'tablet' | 'capsule';
export type DoseStatus = 'unconfirmed' | 'taken' | 'skipped';
export type DayPeriod = 'morning' | 'afternoon' | 'evening';
export type RxRequestStatus = 'draft' | 'sent' | 'completed' | 'dismissed';

export interface CareProfile {
  id: string;
  displayName: string;
  initials: string;
  color: string;
  timezone: 'Europe/Prague';
}

export interface Membership {
  id: string;
  profileId: string;
  userName: string;
  role: Role;
}

export interface DoseTime {
  id: string;
  time: string;
  amount: number;
  period: DayPeriod;
}

export interface RegimenRule {
  id: string;
  medicationId: string;
  effectiveFrom: string;
  daysOfWeek: number[];
  times: DoseTime[];
  asNeeded: boolean;
}

export interface Medication {
  id: string;
  profileId: string;
  name: string;
  strength?: string;
  packageSize: number;
  unit: DoseUnit;
  prescription: boolean;
  ereceptId?: string;
  suklCode?: string;
  note?: string;
  active: boolean;
  createdAt: string;
}

export interface InventoryEvent {
  id: string;
  medicationId: string;
  kind: 'initial' | 'refill' | 'correction';
  quantity: number;
  occurredAt: string;
  note?: string;
}

export interface DoseAction {
  id: string;
  occurrenceId: string;
  medicationId: string;
  profileId: string;
  scheduledAt: string;
  amount: number;
  status: Exclude<DoseStatus, 'unconfirmed'>;
  recordedAt: string;
  recordedBy: string;
}

export interface DoseOccurrence {
  id: string;
  medicationId: string;
  profileId: string;
  scheduledAt: string;
  amount: number;
  period: DayPeriod;
  status: DoseStatus;
  action?: DoseAction;
}

export interface PrescriberContact {
  id: string;
  profileId: string;
  name: string;
  phone?: string;
  email?: string;
}

export interface RxRequest {
  id: string;
  profileId: string;
  medicationId: string;
  prescriberId?: string;
  status: RxRequestStatus;
  channel: 'sms' | 'email' | 'share';
  message: string;
  createdAt: string;
  sentAt?: string;
  completedAt?: string;
}

export interface PendingMutation {
  id: string;
  entity: 'dose_action' | 'dose_action_undo' | 'inventory_event' | 'medication' | 'prescriber' | 'rx_request';
  payload: unknown;
  createdAt: string;
}

export interface NotificationPreferences {
  missedDoseDelayMinutes: number;
  stockThresholdDays: number[];
}

export interface AppData {
  schemaVersion: 1;
  currentProfileId: string;
  activeRole: 'caregiver' | 'senior';
  profiles: CareProfile[];
  memberships: Membership[];
  medications: Medication[];
  regimens: RegimenRule[];
  inventoryEvents: InventoryEvent[];
  doseActions: DoseAction[];
  prescribers: PrescriberContact[];
  rxRequests: RxRequest[];
  pendingMutations: PendingMutation[];
  notificationPreferences: NotificationPreferences;
  lastSyncedAt?: string;
  /** Cloud user this device has already uploaded its full local history for. */
  cloudBootstrappedFor?: string;
}

export interface ForecastResult {
  estimatedStock: number;
  lastCoveredAt: string | null;
  shortageAt: string | null;
  daysRemaining: number | null;
  unconfirmedPastDoses: number;
}

export interface MedicineDraft {
  profileId: string;
  name: string;
  strength?: string;
  packageSize: number;
  unit: DoseUnit;
  prescription: boolean;
  ereceptId?: string;
  times: Pick<DoseTime, 'time' | 'amount' | 'period'>[];
  daysOfWeek: number[];
}
