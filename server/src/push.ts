import type pg from 'pg';
import { transaction } from './db';

export async function deliverAlerts(pool: pg.Pool, delayMinutes: number, accessToken: string | undefined, send: typeof fetch = fetch) {
  return transaction(pool,async (db) => {
    const locked = await db.query<{ acquired: boolean }>("SELECT pg_try_advisory_xact_lock(hashtextextended('moje-leky:push-worker',0)) AS acquired");
    if (!locked.rows[0]?.acquired) return { sent: 0, failed: 0 };
    await db.query(`INSERT INTO app.push_outbox(profile_id,medication_id,scheduled_at,user_id,push_token)
      SELECT p.id,m.id,due.scheduled_at,member.user_id,device.push_token
      FROM app.medications m JOIN app.care_profiles p ON p.id=m.profile_id
      JOIN app.regimen_rules r ON r.medication_id=m.id
      CROSS JOIN LATERAL generate_series((now() AT TIME ZONE p.timezone)::date-1,(now() AT TIME ZONE p.timezone)::date,interval '1 day') day
      CROSS JOIN LATERAL jsonb_array_elements(r.times) dose
      CROSS JOIN LATERAL (SELECT ((day::date+(dose->>'time')::time) AT TIME ZONE p.timezone) AS scheduled_at) due
      JOIN app.memberships member ON member.profile_id=p.id AND member.role IN ('owner','caregiver')
      JOIN app.devices device ON device.user_id=member.user_id
      JOIN public.session session ON session.id=device.session_id AND session."expiresAt">now()
      WHERE m.active AND NOT r.as_needed AND day::date>=r.effective_from AND (r.ends_on IS NULL OR day::date<=r.ends_on)
        AND extract(dow FROM day)::smallint=ANY(r.days_of_week)
        AND due.scheduled_at<=now()-($1::int*interval '1 minute') AND due.scheduled_at>now()-interval '12 hours'
        AND NOT EXISTS(SELECT 1 FROM app.dose_actions a WHERE a.medication_id=m.id AND a.scheduled_at=due.scheduled_at)
      ON CONFLICT(medication_id,scheduled_at,push_token) DO NOTHING`, [delayMinutes]);
    // Recheck membership, session, and confirmation before every attempt.
    await db.query(`UPDATE app.push_outbox o SET sent_at=now() WHERE sent_at IS NULL AND (
      EXISTS(SELECT 1 FROM app.dose_actions a WHERE a.medication_id=o.medication_id AND a.scheduled_at=o.scheduled_at)
      OR NOT EXISTS(SELECT 1 FROM app.memberships m JOIN app.devices d ON d.user_id=m.user_id
        JOIN public.session s ON s.id=d.session_id AND s."expiresAt">now()
        WHERE m.profile_id=o.profile_id AND m.role IN ('owner','caregiver') AND m.user_id=o.user_id AND d.push_token=o.push_token))`);
    const pending = await db.query<{ id: string; profile_id: string; push_token: string; attempts: number }>(`SELECT id,profile_id,push_token,attempts FROM app.push_outbox WHERE sent_at IS NULL AND next_attempt_at<=now() AND attempts<8 ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED`);
    let sent = 0, failed = 0;
    for (const item of pending.rows) {
      try {
        const response = await send('https://exp.host/--/api/v2/push/send', {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
          signal: AbortSignal.timeout(10000), body: JSON.stringify({ to: item.push_token,sound: 'default',channelId: 'medicine-reminders',
            title: 'Moje léky',body: 'Některá dávka zůstala nepotvrzená. Otevřete aplikaci a zkontrolujte dnešní plán.',data: { route: '/(tabs)',profileId: item.profile_id } }),
        });
        const result = await response.json() as { data?: { status?: string; details?: { error?: string } } };
        if (result.data?.details?.error === 'DeviceNotRegistered') {
          await db.query('DELETE FROM app.devices WHERE push_token=$1',[item.push_token]);
        } else if (!response.ok || result.data?.status !== 'ok') { throw new Error('Push nebyl přijat.'); }
        await db.query('UPDATE app.push_outbox SET sent_at=now(),attempts=attempts+1 WHERE id=$1',[item.id]);
        sent++;
      } catch {
        await db.query("UPDATE app.push_outbox SET attempts=attempts+1,next_attempt_at=now()+($2::int*interval '1 minute') WHERE id=$1",[item.id,Math.min(60,2 ** item.attempts)]);
        failed++;
      }
    }
    return { sent,failed };
  });
}
