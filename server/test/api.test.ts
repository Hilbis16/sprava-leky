import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { readConfig } from '../src/config';
import { createPool, migrate } from '../src/db';
import { deliverAlerts } from '../src/push';
import { startPostgres } from './postgres';
import { exportLegacy, importLegacy } from '../src/legacy';

let postgres: Awaited<ReturnType<typeof startPostgres>>;
let pool: ReturnType<typeof createPool>;
let app: Awaited<ReturnType<typeof createApp>>;
const codes = new Map<string,string>();
type Actor = { token: string; user: { id: string; email: string } };
let owner: Actor, other: Actor, caregiver: Actor, senior: Actor;
let loginCount = 0;
const mutation = (entity: string,payload: unknown) => ({ id: randomUUID(),entity,payload,createdAt: new Date().toISOString() });
const headers = (actor: Actor) => ({ authorization: `Bearer ${actor.token}` });
const medicine = (profileId: string) => {
  const id = randomUUID();
  return { medication: { id,profileId,name: 'Testovací lék',packageSize: 30,unit: 'tablet',prescription: false,active: true,createdAt: new Date().toISOString() },
    regimen: { id: randomUUID(),medicationId: id,effectiveFrom: '2026-01-01',daysOfWeek: [0,1,2,3,4,5,6],asNeeded: false,times: [{ id: 'morning',time: '08:00',amount: 1,period: 'morning' }] } };
};
async function login(email: string): Promise<Actor> {
  const remoteAddress = `192.0.2.${++loginCount}`;
  const send = await app.inject({ method: 'POST',url: '/api/auth/email-otp/send-verification-otp',remoteAddress,payload: { email,type: 'sign-in' } });
  expect(send.statusCode,send.body).toBe(200);
  const signed = await app.inject({ method: 'POST',url: '/api/auth/sign-in/email-otp',remoteAddress,payload: { email,otp: codes.get(email),name: email.split('@')[0] } });
  expect(signed.statusCode,signed.body).toBe(200);
  return { ...signed.json(), token: signed.headers['set-auth-token'] ?? signed.json().token };
}
async function sync(actor: Actor, mutations: unknown[], revisions = {}, force = false) {
  return app.inject({ method: 'POST',url: '/v1/sync',headers: headers(actor),payload: { mutations,revisions,force } });
}
async function profile(actor: Actor) {
  const p = { id: randomUUID(),displayName: 'Testovací osoba',initials: 'TO',color: '#147D64',timezone: 'Europe/Prague' };
  const response = await sync(actor,[mutation('profile',p)]);
  expect(response.statusCode,response.body).toBe(200);
  return { p, revision: response.json().revisions[p.id] as number };
}
async function invite(actor: Actor, profileId: string, role: string, recipient: Actor) {
  const response = await app.inject({ method: 'POST',url: '/v1/invites',headers: headers(actor),payload: { profileId,role } });
  expect(response.statusCode,response.body).toBe(200);
  const accepted = await app.inject({ method: 'POST',url: '/v1/invites/accept',headers: headers(recipient),payload: { token: response.json().token } });
  expect(accepted.statusCode,accepted.body).toBe(200);
  return { token: response.json().token as string, data: accepted.json() };
}
beforeAll(async () => {
  postgres = await startPostgres();
  const { connectionString } = postgres;
  pool = createPool(connectionString);
  await migrate(pool); await migrate(pool);
  const config = readConfig({ NODE_ENV: 'test',DATABASE_URL: connectionString,AUTH_SECRET: randomUUID()+randomUUID() });
  app = await createApp(config,pool,async (email,code) => { codes.set(email,code); });
  owner = await login('owner@example.test'); other = await login('other@example.test');
  caregiver = await login('caregiver@example.test'); senior = await login('senior@example.test');
});
afterAll(async () => { await app?.close(); await pool?.end(); if (postgres) await postgres.stop(); });

describe('PostgreSQL API', () => {
  it('odmítne neplatnou dávku před zápisem a přijme následnou opravu jména', async () => {
    const { p, revision } = await profile(owner);
    const valid = mutation('profile', { ...p, displayName: 'A'.repeat(120) });
    const invalid = mutation('profile', { ...p, displayName: 'A'.repeat(121) });
    const rejected = await sync(owner, [valid, invalid], { [p.id]: revision }, true);
    expect(rejected.statusCode, rejected.body).toBe(400);
    const unchanged = await pool.query('SELECT display_name FROM app.care_profiles WHERE id=$1', [p.id]);
    expect(unchanged.rows[0].display_name).toBe(p.displayName);
    const corrected = await sync(owner, [valid], { [p.id]: revision });
    expect(corrected.statusCode, corrected.body).toBe(200);
    const saved = await pool.query('SELECT display_name FROM app.care_profiles WHERE id=$1', [p.id]);
    expect(saved.rows[0].display_name).toBe('A'.repeat(120));
    await pool.query('DELETE FROM app.care_profiles WHERE id=$1', [p.id]);
  });
  it('ověří export, mapování účtů a atomický import původních dat',async () => {
    const oldUser = randomUUID(),p = randomUUID(),m = randomUUID();
    const now = new Date().toISOString();
    const tables = {
      care_profiles: [{ id: p,display_name: 'Přenesený profil',color: '#147D64',timezone: 'Europe/Prague',created_at: now }],
      memberships: [{ id: randomUUID(),profile_id: p,user_id: oldUser,role: 'owner' }],
      medications: [{ id: m,profile_id: p,name: 'Původní lék',package_size: 30,unit: 'tablet',prescription: false,active: true,created_at: now }],
      regimen_rules: [{ id: randomUUID(),medication_id: m,effective_from: '2026-01-01',days_of_week: [1],times: [{ id: 'a',time: '08:00',amount: 1,period: 'morning' }],as_needed: false }],
      inventory_events: [{ id: randomUUID(),medication_id: m,kind: 'initial',quantity: 30,occurred_at: now }],
      dose_actions: [{ id: randomUUID(),occurrence_id: `${m}:${now}`,medication_id: m,profile_id: p,scheduled_at: now,amount: 1,status: 'taken',recorded_at: now,recorded_by: null }],
      prescriber_contacts: [{ id: randomUUID(),profile_id: p,kind: 'doctor',name: 'Kontakt' }],
      rx_requests: [{ id: randomUUID(),profile_id: p,medication_id: m,status: 'draft',channel: 'email',message: 'Původní zpráva',created_at: now }],
    };
    const data = { version: 1,tables };
    await expect(importLegacy(pool,data,{})).rejects.toThrow('Mapování');
    expect((await pool.query('SELECT 1 FROM app.care_profiles')).rowCount).toBe(0);
    expect((await importLegacy(pool,data,{ [oldUser]: owner.user.email })).applied).toBe(false);
    expect((await pool.query('SELECT 1 FROM app.care_profiles')).rowCount).toBe(0);
    expect((await importLegacy(pool,data,{ [oldUser]: owner.user.email },true)).counts.dose_actions).toBe(1);
    await expect(importLegacy(pool,data,{ [oldUser]: owner.user.email },true)).rejects.toThrow('prázdná');
    const snapshot = await app.inject({ url: '/v1/snapshot',headers: headers(owner) });
    expect(snapshot.json().snapshots[0].doseActions).toHaveLength(1);
    for (const table of Object.keys(tables)) {
      await pool.query(`CREATE TABLE public.${table} (LIKE app.${table} INCLUDING DEFAULTS)`);
      await pool.query(`INSERT INTO public.${table} SELECT * FROM app.${table}`);
    }
    const exported = await exportLegacy(pool);
    expect(exported.tables.medications?.[0]?.name).toBe('Původní lék');
    expect(exported.tables.regimen_rules?.[0]?.effective_from).toBe('2026-01-01');
    for (const table of Object.keys(tables)) await pool.query(`DROP TABLE public.${table}`);
    await pool.query('DELETE FROM app.care_profiles WHERE id=$1',[p]);
  });
  it('vyžaduje ověřený účet a odmítne změněný účet klienta',async () => {
    expect((await app.inject('/v1/snapshot')).statusCode).toBe(401);
    expect((await app.inject({ url: '/v1/snapshot',headers: { ...headers(owner),'x-expected-user': other.user.id } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST',url: '/api/auth/sign-in/email-otp',payload: { email: owner.user.email,otp: '000000' } })).statusCode).not.toBe(200);
  });
  it('kód lze použít jednou, vyprší a web používá HttpOnly cookie',async () => {
    const email = 'browser@example.test',remoteAddress = '192.0.2.200';
    const issue = async () => app.inject({ method: 'POST',url: '/api/auth/email-otp/send-verification-otp',remoteAddress,payload: { email,type: 'sign-in' } });
    expect((await issue()).statusCode).toBe(200);
    const stored = await pool.query('SELECT value FROM public.verification WHERE identifier LIKE $1',[`%${email}%`]);
    expect(stored.rows[0].value).not.toContain(codes.get(email));
    const signed = await app.inject({ method: 'POST',url: '/api/auth/sign-in/email-otp',remoteAddress,headers: { origin: 'http://localhost:8081' },payload: { email,otp: codes.get(email) } });
    expect(signed.statusCode,signed.body).toBe(200);
    const raw = signed.headers['set-cookie']; const cookies = Array.isArray(raw) ? raw : [String(raw)];
    expect(cookies.some((c) => /HttpOnly/i.test(c))).toBe(true);
    const cookie = cookies.map((c) => c.split(';')[0]).join('; ');
    expect((await app.inject({ url: '/v1/snapshot',headers: { cookie } })).statusCode).toBe(200);
    const reused = await app.inject({ method: 'POST',url: '/api/auth/sign-in/email-otp',remoteAddress,payload: { email,otp: codes.get(email) } });
    expect(reused.json().code).toBe('INVALID_OTP');
    expect((await issue()).statusCode).toBe(200);
    await pool.query('UPDATE public.verification SET "expiresAt"=now()-interval \'1 minute\' WHERE identifier LIKE $1',[`%${email}%`]);
    const expired = await app.inject({ method: 'POST',url: '/api/auth/sign-in/email-otp',remoteAddress,payload: { email,otp: codes.get(email) } });
    expect(expired.json().code).toBe('OTP_EXPIRED');
  });
  it('omezuje odesílání kódů podle skutečné IP i při podvržené hlavičce',async () => {
    for (let attempt = 1; attempt <= 4; attempt++) {
      const result = await app.inject({ method: 'POST',url: '/api/auth/email-otp/send-verification-otp',remoteAddress: '192.0.2.222',headers: { 'x-forwarded-for': `198.51.100.${attempt}` },payload: { email: `limited${attempt}@example.test`,type: 'sign-in' } });
      expect(result.statusCode,result.body).toBe(attempt <= 3 ? 200 : 429);
    }
  });
  it('oddělí rodiny a opakovanou mutaci provede pouze jednou',async () => {
    const p = { id: randomUUID(),displayName: 'Rodina A',initials: 'RA',color: '#147D64',timezone: 'Europe/Prague' };
    const change = mutation('profile',p);
    const first = await sync(owner,[change]); expect(first.statusCode,first.body).toBe(200);
    const second = await sync(owner,[change]); expect(second.statusCode,second.body).toBe(200);
    expect(second.json().revisions[p.id]).toBe(first.json().revisions[p.id]);
    const stolen = await sync(other,[mutation('profile',{ ...p,displayName: 'Cizí změna' })],{},true);
    expect(stolen.statusCode,stolen.body).toBe(403);
    const snapshot = await app.inject({ url: '/v1/snapshot',headers: headers(other) });
    expect(snapshot.json().snapshots).toHaveLength(0);
    const reused = await sync(owner,[{ ...change,payload: { ...p,displayName: 'Jiný obsah' } }]); expect(reused.statusCode).toBe(409);
  });
  it('odhalí konflikt dvou zařízení a umožní výslovné řešení',async () => {
    const { p,revision } = await profile(owner);
    const a = await sync(owner,[mutation('profile',{ ...p,displayName: 'Zařízení A' })],{ [p.id]: revision }); expect(a.statusCode,a.body).toBe(200);
    const change = mutation('profile',{ ...p,displayName: 'Zařízení B' });
    const b = await sync(owner,[change],{ [p.id]: revision }); expect(b.statusCode,b.body).toBe(409);
    expect(b.json().code).toBe('SYNC_CONFLICT');
    const resolved = await sync(owner,[change],{ [p.id]: revision },true); expect(resolved.statusCode,resolved.body).toBe(200);
    expect(resolved.json().snapshots.find((s: { profile: { id: string } }) => s.profile.id === p.id).profile.displayName).toBe('Zařízení B');
  });
  it('při skutečném souběhu přijme jen jednu revizi',async () => {
    const { p,revision } = await profile(owner);
    const results = await Promise.all(['A','B'].map((name) => sync(owner,[mutation('profile',{ ...p,displayName: name })],{ [p.id]: revision })));
    expect(results.map((r) => r.statusCode).sort()).toEqual([200,409]);
    expect((await pool.query('SELECT revision FROM app.care_profiles WHERE id=$1',[p.id])).rows[0].revision).toBe(revision+1);
  });
  it('přenese lék, zásobu, dávku, kontakt i recept a odmítne vazbu na cizí rodinu',async () => {
    const { p,revision } = await profile(owner);
    const otherProfile = await profile(other);
    const payload = medicine(p.id),m = payload.medication.id;
    const now = new Date().toISOString();
    const changes = [mutation('medication',payload),mutation('inventory_event',{ id: randomUUID(),medicationId: m,kind: 'initial',quantity: 30,occurredAt: now }),
      mutation('dose_action',{ id: randomUUID(),medicationId: m,profileId: p.id,occurrenceId: `${m}:${now}`,scheduledAt: now,amount: 1,status: 'taken',recordedAt: now,recordedBy: 'Klient' }),
      mutation('prescriber',{ id: randomUUID(),profileId: p.id,kind: 'doctor',name: 'Lékař' }),
      mutation('rx_request',{ id: randomUUID(),profileId: p.id,medicationId: m,status: 'draft',channel: 'sms',message: 'Žádost',createdAt: now })];
    const result = await sync(owner,changes,{ [p.id]: revision }); expect(result.statusCode,result.body).toBe(200);
    const family = result.json().snapshots.find((s: { profile: { id: string } }) => s.profile.id === p.id);
    for (const key of ['medications','regimens','inventoryEvents','doseActions','prescribers','rxRequests']) expect(family[key]).toHaveLength(1);
    expect(family.doseActions[0].recordedBy).not.toBe('Klient');
    const cross = await sync(other,[mutation('rx_request',{ id: randomUUID(),profileId: otherProfile.p.id,medicationId: m,status: 'draft',channel: 'sms',message: 'Cizí lék',createdAt: now })],{},true);
    expect(cross.statusCode,cross.body).toBe(403);
    await invite(owner,p.id,'senior',senior);
    expect((await sync(senior,[changes[1]],{},true)).statusCode).toBe(403);
    expect((await sync(senior,[{ ...changes[2],id: randomUUID() }],{},true)).statusCode).toBe(200);
  });
  it('pozvánka je jednorázová a senior nesmí upravovat profil',async () => {
    const { p } = await profile(owner);
    const accepted = await invite(owner,p.id,'senior',senior);
    const again = await app.inject({ method: 'POST',url: '/v1/invites/accept',headers: headers(other),payload: { token: accepted.token } }); expect(again.statusCode).toBe(400);
    expect((await sync(senior,[mutation('profile',{ ...p,displayName: 'Změna seniora' })],{},true)).statusCode).toBe(403);
    await invite(owner,p.id,'caregiver',caregiver);
    expect((await sync(caregiver,[mutation('profile',{ ...p,displayName: 'Změna pečujícího' })],{},true)).statusCode).toBe(200);
    const stored = (await pool.query('SELECT token_hash FROM app.family_invites WHERE profile_id=$1',[p.id])).rows;
    expect(stored.every((r: { token_hash: string }) => r.token_hash !== accepted.token)).toBe(true);
  });
  it('při selhání pozdější změny vrátí celou transakci zpět',async () => {
    const { p,revision } = await profile(owner);
    const changed = mutation('profile',{ ...p,displayName: 'Nesmí zůstat' });
    const invalid = mutation('dose_action_undo',{ profileId: p.id,medicationId: randomUUID(),occurrenceId: 'neexistuje' });
    const response = await sync(owner,[changed,invalid],{ [p.id]: revision }); expect(response.statusCode).toBe(403);
    const stored = await pool.query('SELECT display_name,revision FROM app.care_profiles WHERE id=$1',[p.id]);
    expect(stored.rows[0]).toMatchObject({ display_name: p.displayName,revision });
    expect((await pool.query('SELECT 1 FROM app.mobile_mutations WHERE user_id=$1 AND id=$2',[owner.user.id,changed.id])).rowCount).toBe(0);
  });
  it('odhlášení zneplatní session i registraci push zařízení',async () => {
    const actor = await login('logout@example.test');
    const registered = await app.inject({ method: 'POST',url: '/v1/devices',headers: headers(actor),payload: { pushToken: 'ExpoPushToken[test-token]',platform: 'android' } }); expect(registered.statusCode,registered.body).toBe(200);
    const signed = await app.inject({ method: 'POST',url: '/api/auth/sign-out',headers: headers(actor),payload: {} }); expect(signed.statusCode,signed.body).toBe(200);
    expect((await app.inject({ url: '/v1/snapshot',headers: headers(actor) })).statusCode).toBe(401);
    expect((await pool.query('SELECT 1 FROM app.devices WHERE user_id=$1',[actor.user.id])).rowCount).toBe(0);
  });
  it('spustí plánovač upozornění bez externího odesílání',async () => {
    const result = await deliverAlerts(pool,120,undefined,async () => { throw new Error('Bez příjemců se nesmí odesílat.'); });
    expect(result).toEqual({ sent: 0,failed: 0 });
  });
  it('upozorní jen pečující, neopakuje doručené a respektuje konec kúry i potvrzení',async () => {
    const { p,revision } = await profile(owner);
    const payload = medicine(p.id);
    const due = new Date(Date.now()-3*60*60*1000);
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA',{ timeZone: 'Europe/Prague',year: 'numeric',month: '2-digit',day: '2-digit',hour: '2-digit',minute: '2-digit',hourCycle: 'h23' }).formatToParts(due).map((part) => [part.type,part.value]));
    const date = `${parts.year}-${parts.month}-${parts.day}`;
    payload.regimen.effectiveFrom = date;
    payload.regimen.times[0]!.time = `${parts.hour}:${parts.minute}`;
    expect((await sync(owner,[mutation('medication',payload)],{ [p.id]: revision })).statusCode).toBe(200);
    await invite(owner,p.id,'caregiver',caregiver); await invite(owner,p.id,'senior',senior);
    for (const [actor,token] of [[caregiver,'caregiver-alert'],[senior,'senior-alert']] as const) {
      expect((await app.inject({ method: 'POST',url: '/v1/devices',headers: headers(actor),payload: { pushToken: `ExpoPushToken[${token}]`,platform: 'android' } })).statusCode).toBe(200);
    }
    const sent: { to: string; body: string }[] = [];
    const capture: typeof fetch = async (_url,init) => { sent.push(JSON.parse(init!.body as string)); return new Response(JSON.stringify({ data: { status: 'ok' } }),{ status: 200 }); };
    expect(await deliverAlerts(pool,120,undefined,async () => { throw new Error('Simulace výpadku.'); })).toEqual({ sent: 0,failed: 1 });
    await pool.query("UPDATE app.push_outbox SET next_attempt_at=now() WHERE sent_at IS NULL");
    expect(await deliverAlerts(pool,120,undefined,capture)).toEqual({ sent: 1,failed: 0 });
    expect(sent).toHaveLength(1); expect(sent[0]?.to).toBe('ExpoPushToken[caregiver-alert]');
    expect(sent[0]?.body).not.toContain(payload.medication.name);
    expect(await deliverAlerts(pool,120,undefined,capture)).toEqual({ sent: 0,failed: 0 });
    // Zrušené upozornění před opakováním nesmí odejít po potvrzení dávky.
    const outbox = (await pool.query('SELECT * FROM app.push_outbox WHERE medication_id=$1',[payload.medication.id])).rows[0];
    await pool.query('UPDATE app.push_outbox SET sent_at=NULL,next_attempt_at=now() WHERE id=$1',[outbox.id]);
    const scheduledAt = outbox.scheduled_at.toISOString();
    await sync(senior,[mutation('dose_action',{ id: randomUUID(),medicationId: payload.medication.id,profileId: p.id,occurrenceId: `${payload.medication.id}:${scheduledAt}`,scheduledAt,amount: 1,status: 'taken',recordedAt: new Date().toISOString(),recordedBy: 'Senior' })],{},true);
    expect(await deliverAlerts(pool,120,undefined,capture)).toEqual({ sent: 0,failed: 0 });
    await pool.query('DELETE FROM app.dose_actions WHERE medication_id=$1',[payload.medication.id]);
    await pool.query('DELETE FROM app.push_outbox WHERE medication_id=$1',[payload.medication.id]);
    await pool.query("UPDATE app.regimen_rules SET effective_from=$2::date-1,ends_on=$2::date-1 WHERE medication_id=$1",[payload.medication.id,date]);
    expect(await deliverAlerts(pool,120,undefined,capture)).toEqual({ sent: 0,failed: 0 });
    await pool.query('DELETE FROM app.devices WHERE user_id=ANY($1)',[[caregiver.user.id,senior.user.id]]);
  });
});
