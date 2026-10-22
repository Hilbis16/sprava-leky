import { createHash, randomUUID } from 'node:crypto';
import type pg from 'pg';
import { transaction, type Db } from './db';
import { forbidden, HttpError } from './errors';
import { readSnapshot } from './snapshot';
import { type Mutation, syncSchema } from './validation';

export async function requireRole(db: Db, userId: string, profileId: string, edit = false) {
  const result = await db.query<{ role: string }>('SELECT role FROM app.memberships WHERE profile_id=$1 AND user_id=$2', [profileId, userId]);
  const role = result.rows[0]?.role;
  if (!role || (edit && role === 'senior')) throw forbidden();
  return role;
}

async function recordProfile(db: Db, table: 'medications' | 'prescriber_contacts', id: string) {
  const result = await db.query<{ profile_id: string }>(`SELECT profile_id FROM app.${table} WHERE id=$1`, [id]);
  if (!result.rows[0]) throw forbidden();
  return result.rows[0].profile_id;
}
async function assertScope(db: Db, table: 'medications' | 'prescriber_contacts' | 'rx_requests', id: string, profileId: string) {
  const existing = await db.query<{ profile_id: string }>(`SELECT profile_id FROM app.${table} WHERE id=$1`, [id]);
  if (existing.rows[0] && existing.rows[0].profile_id !== profileId) throw forbidden();
}
async function profileFor(db: Db, mutation: Mutation, newMedications: Map<string, string>) {
  const p = mutation.payload;
  switch (mutation.entity) {
    case 'profile': case 'profile_remove': return mutation.payload.id;
    case 'medication': return mutation.payload.medication.profileId;
    case 'prescriber_remove': return recordProfile(db, 'prescriber_contacts', mutation.payload.id);
    case 'inventory_event': return newMedications.get(mutation.payload.medicationId) ?? recordProfile(db, 'medications', mutation.payload.medicationId);
    default: return 'profileId' in p ? p.profileId : '';
  }
}

async function apply(db: Db, userId: string, mutation: Mutation, profileId: string) {
  const role = mutation.entity === 'profile' && !(await db.query('SELECT 1 FROM app.care_profiles WHERE id=$1', [profileId])).rowCount
    ? 'new' : await requireRole(db, userId, profileId, !['dose_action', 'dose_action_undo', 'profile_remove'].includes(mutation.entity));
  switch (mutation.entity) {
    case 'profile': {
      const p = mutation.payload;
      await db.query('INSERT INTO app.care_profiles(id,display_name,color) VALUES ($1,$2,$3) ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name,color=excluded.color', [p.id,p.displayName,p.color]);
      if (role === 'new') await db.query("INSERT INTO app.memberships(id,profile_id,user_id,role) VALUES ($1,$2,$3,'owner')", [randomUUID(),p.id,userId]);
      break;
    }
    case 'profile_remove':
      if (role === 'owner') await db.query('DELETE FROM app.care_profiles WHERE id=$1', [profileId]);
      else await db.query('DELETE FROM app.memberships WHERE profile_id=$1 AND user_id=$2', [profileId,userId]);
      break;
    case 'medication': {
      const { medication: m, regimen: r, inventory } = mutation.payload;
      await assertScope(db, 'medications', m.id, profileId);
      const oldRegimen = await db.query<{ medication_id: string }>('SELECT medication_id FROM app.regimen_rules WHERE id=$1', [r.id]);
      if (oldRegimen.rows[0] && oldRegimen.rows[0].medication_id !== m.id) throw forbidden();
      await db.query(`INSERT INTO app.medications(id,profile_id,name,strength,package_size,unit,prescription,erecept_id,sukl_code,note,active,created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(id) DO UPDATE SET name=excluded.name,strength=excluded.strength,package_size=excluded.package_size,unit=excluded.unit,prescription=excluded.prescription,erecept_id=excluded.erecept_id,sukl_code=excluded.sukl_code,note=excluded.note,active=excluded.active`, [m.id,profileId,m.name,m.strength,m.packageSize,m.unit,m.prescription,m.ereceptId,m.suklCode,m.note,m.active,m.createdAt]);
      await db.query(`INSERT INTO app.regimen_rules(id,medication_id,effective_from,ends_on,days_of_week,times,as_needed) VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT(medication_id) DO UPDATE SET effective_from=excluded.effective_from,ends_on=excluded.ends_on,days_of_week=excluded.days_of_week,times=excluded.times,as_needed=excluded.as_needed`, [r.id,m.id,r.effectiveFrom,r.endsOn,r.daysOfWeek,JSON.stringify(r.times),r.asNeeded]);
      if (inventory) await insertInventory(db, inventory);
      break;
    }
    case 'inventory_event': await insertInventory(db, mutation.payload); break;
    case 'dose_action': {
      const p = mutation.payload;
      if (await recordProfile(db, 'medications', p.medicationId) !== profileId) throw forbidden();
      await db.query(`INSERT INTO app.dose_actions(id,occurrence_id,medication_id,profile_id,scheduled_at,amount,status,recorded_at,recorded_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(occurrence_id) DO UPDATE SET status=excluded.status,recorded_at=excluded.recorded_at,recorded_by=excluded.recorded_by`, [p.id,p.occurrenceId,p.medicationId,profileId,p.scheduledAt,p.amount,p.status,p.recordedAt,userId]);
      break;
    }
    case 'dose_action_undo': {
      const p = mutation.payload;
      if (await recordProfile(db, 'medications', p.medicationId) !== profileId) throw forbidden();
      await db.query('DELETE FROM app.dose_actions WHERE occurrence_id=$1 AND medication_id=$2 AND profile_id=$3', [p.occurrenceId,p.medicationId,profileId]);
      break;
    }
    case 'prescriber': {
      const p = mutation.payload;
      await assertScope(db, 'prescriber_contacts', p.id, profileId);
      await db.query(`INSERT INTO app.prescriber_contacts(id,profile_id,kind,name,phone,email) VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,name=excluded.name,phone=excluded.phone,email=excluded.email`, [p.id,profileId,p.kind,p.name,p.phone,p.email]);
      break;
    }
    case 'prescriber_remove': await db.query('DELETE FROM app.prescriber_contacts WHERE id=$1 AND profile_id=$2', [mutation.payload.id,profileId]); break;
    case 'rx_request': {
      const p = mutation.payload;
      await assertScope(db, 'rx_requests', p.id, profileId);
      if (await recordProfile(db, 'medications', p.medicationId) !== profileId) throw forbidden();
      await db.query(`INSERT INTO app.rx_requests(id,profile_id,medication_id,status,channel,message,created_at,sent_at,completed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT(id) DO UPDATE SET status=excluded.status,sent_at=excluded.sent_at,completed_at=excluded.completed_at`, [p.id,profileId,p.medicationId,p.status,p.channel,p.message,p.createdAt,p.sentAt,p.completedAt]);
      break;
    }
  }
}

async function insertInventory(db: Db, p: Extract<Mutation, { entity: 'inventory_event' }>['payload']) {
  const existing = await db.query<{ medication_id: string }>('SELECT medication_id FROM app.inventory_events WHERE id=$1', [p.id]);
  if (existing.rows[0] && existing.rows[0].medication_id !== p.medicationId) throw forbidden();
  if (p.kind !== 'correction' && p.quantity < 0) throw new HttpError(400, 'VALIDATION', 'Doplnění zásoby nesmí být záporné.');
  await db.query('INSERT INTO app.inventory_events(id,medication_id,kind,quantity,occurred_at,note) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING', [p.id,p.medicationId,p.kind,p.quantity,p.occurredAt,p.note]);
}

export async function synchronize(pool: pg.Pool, userId: string, input: unknown) {
  const request = syncSchema.parse(input);
  return transaction(pool, async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`user:${userId}`]);
    const pending: { mutation: Mutation; hash: string; profileId: string }[] = [];
    const newMedications = new Map(request.mutations.filter((m) => m.entity === 'medication').map((m) => [m.payload.medication.id,m.payload.medication.profileId]));
    const seen = new Map<string,string>();
    for (const mutation of request.mutations) {
      const hash = createHash('sha256').update(JSON.stringify({ entity: mutation.entity, payload: mutation.payload })).digest('hex');
      const previous = (await db.query<{ payload_hash: string }>('SELECT payload_hash FROM app.mobile_mutations WHERE user_id=$1 AND id=$2', [userId,mutation.id])).rows[0]?.payload_hash ?? seen.get(mutation.id);
      if (previous) {
        if (previous !== hash) throw new HttpError(409, 'MUTATION_REUSED', 'Identifikátor změny byl použit s jiným obsahem.');
        continue;
      }
      seen.set(mutation.id,hash);
      pending.push({ mutation,hash,profileId: await profileFor(db,mutation,newMedications) });
    }
    const profileIds = [...new Set(pending.map((p) => p.profileId))].sort();
    for (const profileId of profileIds) {
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`profile:${profileId}`]);
      const profile = (await db.query<{ revision: number }>('SELECT revision FROM app.care_profiles WHERE id=$1 FOR UPDATE', [profileId])).rows[0];
      if (profile) await requireRole(db,userId,profileId);
      else if (!pending.some((p) => p.profileId === profileId && p.mutation.entity === 'profile')) throw forbidden();
      if (!request.force && (request.revisions[profileId] ?? 0) !== (profile?.revision ?? 0)) {
        throw new HttpError(409, 'SYNC_CONFLICT', 'Data mezitím změnilo jiné zařízení. Lokální změny zůstaly uložené.');
      }
    }
    for (const { mutation,hash,profileId } of pending) {
      await apply(db,userId,mutation,profileId);
      await db.query('INSERT INTO app.mobile_mutations(user_id,id,payload_hash) VALUES ($1,$2,$3)', [userId,mutation.id,hash]);
    }
    for (const id of profileIds) await db.query('UPDATE app.care_profiles SET revision=revision+1 WHERE id=$1', [id]);
    return { ...(await readSnapshot(db,userId)), acknowledged: request.mutations.map((m) => m.id) };
  });
}
