import { createHash, randomBytes, randomUUID } from 'node:crypto';
import Fastify, { LogController } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import type pg from 'pg';
import { createAuth, type SendCode } from './auth';
import type { Config } from './config';
import { transaction } from './db';
import { HttpError } from './errors';
import { requireRole, synchronize } from './mutations';
import { readSnapshot } from './snapshot';
import { deviceSchema, inviteSchema } from './validation';

export async function createApp(config: Config, pool: pg.Pool, sendCode?: SendCode) {
  const auth = createAuth(config,pool,sendCode);
  const app = Fastify({ logger: config.NODE_ENV !== 'test', logController: new LogController({ disableRequestLogging: true }), bodyLimit: 10 * 1024 * 1024,
    trustProxy: config.TRUST_PROXY === 'false' ? false : config.TRUST_PROXY.split(',').map((value) => value.trim()) });
  app.setErrorHandler((error,request,reply) => {
    if (error instanceof HttpError) return reply.status(error.status).send({ code: error.code,message: error.message });
    if (error instanceof z.ZodError) return reply.status(400).send({ code: 'VALIDATION',message: 'Požadavek obsahuje neplatná data.' });
    const code = (error as { code?: string }).code;
    if (code === '40001' || code === '40P01') return reply.status(409).send({ code: 'SYNC_CONFLICT',message: 'Data se současně změnila. Změny zůstaly v zařízení.' });
    if (code === '23505') return reply.status(409).send({ code: 'DUPLICATE',message: 'Záznam s tímto identifikátorem již existuje.' });
    if (code === '23503' || code === '23514' || code === '22P02' || code === '22007') return reply.status(400).send({ code: 'VALIDATION',message: 'Záznam má neplatné hodnoty nebo vazby.' });
    if ((error as { statusCode?: number }).statusCode === 429) return reply.status(429).send({ code: 'RATE_LIMIT',message: 'Příliš mnoho pokusů. Zkuste to za chvíli.' });
    if ((error as { statusCode?: number }).statusCode === 400) return reply.status(400).send({ code: 'VALIDATION',message: 'Požadavek obsahuje neplatná data.' });
    if ((error as { statusCode?: number }).statusCode === 413) return reply.status(413).send({ code: 'TOO_LARGE',message: 'Požadavek překročil povolenou velikost.' });
    request.log.error({ code: code ?? 'INTERNAL' },'Požadavek selhal');
    return reply.status(500).send({ code: 'INTERNAL',message: 'Server nemohl dokončit požadavek.' });
  });
  await app.register(cors, { origin: config.origins, credentials: true, exposedHeaders: ['set-auth-token'] });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  const headersFor = (headers: Record<string, string | string[] | undefined>) => {
    const result = new Headers();
    for (const [key,value] of Object.entries(headers)) if (value !== undefined) result.set(key, Array.isArray(value) ? value.join(',') : value);
    return result;
  };
  app.route({ method: ['GET','POST'], url: '/api/auth/*', config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, handler: async (request,reply) => {
    const route = request.url.split('?')[0];
    const allowed = request.method === 'GET' ? ['/api/auth/get-session'] : [
      '/api/auth/email-otp/send-verification-otp','/api/auth/sign-in/email-otp','/api/auth/sign-out',
    ];
    if (!route || !allowed.includes(route)) throw new HttpError(404,'NOT_FOUND','Požadovaná operace neexistuje.');
    if (route === '/api/auth/email-otp/send-verification-otp') {
      z.object({ email: z.string().email().max(254),type: z.literal('sign-in') }).parse(request.body);
    }
    if (route === '/api/auth/sign-in/email-otp') {
      z.object({ email: z.string().email().max(254),otp: z.string().regex(/^\d{6}$/),name: z.string().trim().min(1).max(120).optional() }).parse(request.body);
    }
    const authHeaders = headersFor(request.headers);
    authHeaders.set('x-forwarded-for',request.ip);
    authHeaders.delete('x-real-ip');
    const response = await auth.handler(new Request(new URL(request.url,config.PUBLIC_API_URL), {
      method: request.method, headers: authHeaders,
      body: request.method === 'GET' ? undefined : JSON.stringify(request.body ?? {}),
    }));
    reply.code(response.status);
    response.headers.forEach((value,key) => { if (key !== 'set-cookie') reply.header(key,value); });
    const cookies = response.headers.getSetCookie();
    if (cookies.length) reply.header('set-cookie',cookies);
    return reply.send(await response.text());
  } });
  app.get('/health', async () => { await pool.query('SELECT 1'); return { status: 'ok' }; });
  await app.register(async (api) => {
    api.decorateRequest('accountId','');
    api.decorateRequest('sessionId','');
    api.addHook('preHandler', async (request) => {
      const session = await auth.api.getSession({ headers: headersFor(request.headers) });
      if (!session?.user.emailVerified) throw new HttpError(401,'AUTH_REQUIRED','Přihlaste se ověřeným e-mailem.');
      const expected = request.headers['x-expected-user'];
      if (expected && expected !== session.user.id) throw new HttpError(401,'ACCOUNT_CHANGED','Přihlášený účet se změnil.');
      request.accountId = session.user.id;
      request.sessionId = session.session.id;
    });
    api.get('/snapshot', async (request) => transaction(pool, (db) => readSnapshot(db,request.accountId)));
    api.post('/sync', async (request) => synchronize(pool,request.accountId,request.body));
    api.post('/invites', async (request) => {
      const input = inviteSchema.parse(request.body);
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await transaction(pool,async (db) => {
        await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`profile:${input.profileId}`]);
        await requireRole(db,request.accountId,input.profileId,true);
        await db.query('INSERT INTO app.family_invites(id,profile_id,token_hash,role,created_by,expires_at) VALUES ($1,$2,$3,$4,$5,$6)', [randomUUID(),input.profileId,createHash('sha256').update(token).digest('hex'),input.role,request.accountId,expiresAt]);
      });
      return { token,expiresAt,role: input.role,url: `mojeleky://invite/${token}` };
    });
    api.post('/invites/accept', async (request) => {
      const { token } = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).parse(request.body);
      return transaction(pool,async (db) => {
        const invite = (await db.query<{ id: string; profile_id: string; role: string; created_by: string }>(`SELECT id,profile_id,role,created_by FROM app.family_invites
          WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() FOR UPDATE`, [createHash('sha256').update(token).digest('hex')])).rows[0];
        if (!invite) throw new HttpError(400,'INVALID_INVITE','Pozvánka vypršela nebo již byla použita.');
        await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`profile:${invite.profile_id}`]);
        // Removing the inviter's membership also invalidates outstanding invitations.
        await requireRole(db,invite.created_by,invite.profile_id,true);
        await db.query('INSERT INTO app.memberships(id,profile_id,user_id,role) VALUES ($1,$2,$3,$4) ON CONFLICT(profile_id,user_id) DO NOTHING', [randomUUID(),invite.profile_id,request.accountId,invite.role]);
        await db.query('UPDATE app.family_invites SET used_at=now(),used_by=$1 WHERE id=$2', [request.accountId,invite.id]);
        await db.query('UPDATE app.care_profiles SET revision=revision+1 WHERE id=$1',[invite.profile_id]);
        return readSnapshot(db,request.accountId);
      });
    });
    api.post('/devices', async (request) => {
      const p = deviceSchema.parse(request.body);
      await pool.query('INSERT INTO app.devices(id,user_id,session_id,push_token,platform) VALUES ($1,$2,$3,$4,$5) ON CONFLICT(push_token) DO UPDATE SET user_id=excluded.user_id,session_id=excluded.session_id,platform=excluded.platform,updated_at=now()', [randomUUID(),request.accountId,request.sessionId,p.pushToken,p.platform]);
      return { registered: true };
    });
    api.delete('/devices', async (request) => {
      const { pushToken } = z.object({ pushToken: z.string().min(1).max(250) }).parse(request.body);
      await pool.query('DELETE FROM app.devices WHERE user_id=$1 AND push_token=$2',[request.accountId,pushToken]);
      return { removed: true };
    });
    api.setNotFoundHandler(() => { throw new HttpError(404,'NOT_FOUND','Požadovaná operace neexistuje.'); });
  }, { prefix: '/v1' });

  return app;
}

declare module 'fastify' { interface FastifyRequest { accountId: string; sessionId: string } }
