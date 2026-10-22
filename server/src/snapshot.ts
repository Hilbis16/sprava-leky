import type { CareProfile, Membership, Medication, RegimenRule, InventoryEvent, DoseAction, PrescriberContact, RxRequest } from '../../src/domain/types';
import type { Db } from './db';

export interface Snapshot {
  profile: CareProfile; memberships: Membership[]; medications: Medication[]; regimens: RegimenRule[];
  inventoryEvents: InventoryEvent[]; doseActions: DoseAction[]; prescribers: PrescriberContact[]; rxRequests: RxRequest[];
}
async function rows<T>(db: Db, sql: string, values: unknown[]): Promise<T[]> {
  return JSON.parse(JSON.stringify((await db.query(sql, values)).rows)) as T[];
}
export async function readSnapshot(db: Db, userId: string) {
  const profiles = await rows<CareProfile & { revision: number }>(db, `SELECT p.id, p.display_name AS "displayName", p.color, p.timezone, p.revision,
    '' AS initials FROM app.care_profiles p JOIN app.memberships m ON m.profile_id=p.id WHERE m.user_id=$1 ORDER BY p.created_at,p.id`, [userId]);
  const snapshots: Snapshot[] = [];
  const revisions: Record<string, number> = {};
  for (const { revision, ...profile } of profiles) {
    profile.initials = profile.displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toLocaleUpperCase('cs-CZ');
    revisions[profile.id] = revision;
    const values = [profile.id];
    snapshots.push({ profile,
      memberships: await rows<Membership>(db, `SELECT m.id, m.profile_id AS "profileId", m.role, u.name AS "userName", m.user_id AS "userId" FROM app.memberships m JOIN public."user" u ON u.id=m.user_id WHERE m.profile_id=$1 ORDER BY m.id`, values),
      medications: await rows<Medication>(db, `SELECT id, profile_id AS "profileId", name, strength, package_size::float8 AS "packageSize", unit, prescription, erecept_id AS "ereceptId", sukl_code AS "suklCode", note, active, created_at AS "createdAt" FROM app.medications WHERE profile_id=$1 ORDER BY id`, values),
      regimens: await rows<RegimenRule>(db, `SELECT r.id,r.medication_id AS "medicationId", r.effective_from::text AS "effectiveFrom", r.ends_on::text AS "endsOn",r.days_of_week AS "daysOfWeek",r.times,r.as_needed AS "asNeeded" FROM app.regimen_rules r JOIN app.medications m ON m.id=r.medication_id WHERE m.profile_id=$1 ORDER BY r.id`, values),
      inventoryEvents: await rows<InventoryEvent>(db, `SELECT e.id,e.medication_id AS "medicationId",e.kind,e.quantity::float8 AS quantity,e.occurred_at AS "occurredAt",e.note FROM app.inventory_events e JOIN app.medications m ON m.id=e.medication_id WHERE m.profile_id=$1 ORDER BY e.occurred_at,e.id`, values),
      doseActions: await rows<DoseAction>(db, `SELECT d.id,d.occurrence_id AS "occurrenceId",d.medication_id AS "medicationId",d.profile_id AS "profileId",d.scheduled_at AS "scheduledAt",d.amount::float8 AS amount,d.status,d.recorded_at AS "recordedAt",coalesce(u.name,'Dřívější záznam') AS "recordedBy" FROM app.dose_actions d LEFT JOIN public."user" u ON u.id=d.recorded_by WHERE d.profile_id=$1 ORDER BY d.scheduled_at,d.id`, values),
      prescribers: await rows<PrescriberContact>(db, `SELECT id,profile_id AS "profileId",kind,name,phone,email FROM app.prescriber_contacts WHERE profile_id=$1 ORDER BY id`, values),
      rxRequests: await rows<RxRequest>(db, `SELECT id,profile_id AS "profileId",medication_id AS "medicationId",status,channel,message,created_at AS "createdAt",sent_at AS "sentAt",completed_at AS "completedAt" FROM app.rx_requests WHERE profile_id=$1 ORDER BY created_at,id`, values),
    });
  }
  // Optional client fields use undefined rather than SQL null in domain objects.
  const clean = JSON.parse(JSON.stringify(snapshots), (_key, value: unknown) => value === null ? undefined : value) as Snapshot[];
  return { snapshots: clean, revisions, syncedAt: new Date().toISOString() };
}
