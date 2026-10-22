import type pg from 'pg';
import { z } from 'zod';

// Explicitní seznam tabulek a sloupců. Identifikátory nikdy nepocházejí ze souboru.
const tables = {
  care_profiles: ['id','display_name','color','timezone','created_at'],
  memberships: ['id','profile_id','user_id','role'],
  medications: ['id','profile_id','name','strength','package_size','unit','prescription','erecept_id','sukl_code','note','active','created_at'],
  regimen_rules: ['id','medication_id','effective_from','ends_on','days_of_week','times','as_needed'],
  inventory_events: ['id','medication_id','kind','quantity','occurred_at','note'],
  dose_actions: ['id','occurrence_id','medication_id','profile_id','scheduled_at','amount','status','recorded_at','recorded_by'],
  prescriber_contacts: ['id','profile_id','kind','name','phone','email'],
  rx_requests: ['id','profile_id','medication_id','status','channel','message','created_at','sent_at','completed_at'],
} as const;
type Table = keyof typeof tables;
const names = Object.keys(tables) as Table[];
const rowSchema = z.record(z.string(),z.unknown());
const exportSchema = z.object({ version: z.literal(1),tables: z.record(z.string(),z.array(rowSchema)) });
export type LegacyExport = z.infer<typeof exportSchema>;

export async function exportLegacy(pool: pg.Pool): Promise<LegacyExport> {
  const db = await pool.connect();
  try {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const result: LegacyExport = { version: 1,tables: {} };
    for (const table of names) {
      const columns = tables[table].map((column) => column === 'effective_from' || column === 'ends_on' ? `${column}::text AS ${column}` : column);
      result.tables[table] = (await db.query(`SELECT ${columns.join(',')} FROM public.${table} ORDER BY id`)).rows;
    }
    await db.query('COMMIT');
    return JSON.parse(JSON.stringify(result)) as LegacyExport;
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { db.release(); }
}

export async function importLegacy(pool: pg.Pool, input: unknown, mappingInput: unknown, apply = false) {
  const data = exportSchema.parse(input);
  const mapping = z.record(z.string().uuid(),z.string().email()).parse(mappingInput);
  for (const table of names) if (!data.tables[table]) throw new Error(`Export neobsahuje tabulku ${table}.`);
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('LOCK TABLE app.care_profiles,app.memberships,app.medications IN ACCESS EXCLUSIVE MODE');
    if ((await db.query('SELECT 1 FROM app.care_profiles LIMIT 1')).rowCount) throw new Error('Cílová aplikační databáze musí být prázdná.');
    const users = new Map<string,string>();
    for (const [oldId,email] of Object.entries(mapping)) {
      const user = (await db.query<{ id: string }>('SELECT id FROM public."user" WHERE lower(email)=lower($1) AND "emailVerified"',[email])).rows[0];
      if (!user) throw new Error('Každý cílový účet musí být předem přihlášený a ověřený e-mailovým kódem.');
      users.set(oldId,user.id);
    }
    const mapUser = (value: unknown) => {
      const mapped = typeof value === 'string' ? users.get(value) : undefined;
      if (!mapped) throw new Error('Mapování nepokrývá všechna původní členství nebo autory záznamů.');
      return mapped;
    };
    const counts: Record<string,number> = {};
    for (const table of names) {
      const columns = tables[table];
      const rows = data.tables[table]!;
      counts[table] = rows.length;
      for (const row of rows) {
        const values = columns.map((column) => {
          const value = row[column] ?? null;
          if (column === 'user_id' || (column === 'recorded_by' && value !== null)) return mapUser(value);
          return column === 'times' ? JSON.stringify(value) : value;
        });
        await db.query(`INSERT INTO app.${table}(${columns.join(',')}) VALUES (${columns.map((_,index) => `$${index+1}`).join(',')})`,values);
      }
    }
    const orphan = await db.query("SELECT 1 FROM app.care_profiles p WHERE NOT EXISTS(SELECT 1 FROM app.memberships m WHERE m.profile_id=p.id AND m.role='owner') LIMIT 1");
    if (orphan.rowCount) throw new Error('Každý přenesený profil musí mít vlastníka.');
    await db.query('UPDATE app.care_profiles SET revision=1');
    await db.query(apply ? 'COMMIT' : 'ROLLBACK');
    return { applied: apply,counts };
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { db.release(); }
}
