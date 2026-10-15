import { createClient } from 'npm:@supabase/supabase-js@2';

const jsonHeaders = { 'Content-Type': 'application/json' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: jsonHeaders });

interface ExpoTicket { status: 'ok' | 'error'; details?: { error?: string } }

// Runs from cron (see README). Claims doses that stayed unconfirmed and sends
// one generic push per affected profile to its owners and caregivers. The text
// names neither the medicine nor the person: it is shown on a lock screen.
Deno.serve(async (request) => {
  const secret = request.headers.get('x-cron-secret');
  if (!secret || secret !== Deno.env.get('CRON_SECRET')) return json({ error: 'Unauthorized' }, 401);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const delayMinutes = Number(Deno.env.get('MISSED_DOSE_DELAY_MINUTES') ?? 120);

  const { data: alerts, error: claimError } = await supabase.rpc('claim_missed_dose_alerts', { delay_minutes: delayMinutes });
  if (claimError) return json({ error: claimError.message }, 500);
  const profileIds = [...new Set(((alerts ?? []) as { profile_id: string }[]).map((alert) => alert.profile_id))];
  if (!profileIds.length) return json({ alerts: 0, sent: 0 });

  const { data: tokens, error: tokenError } = await supabase.rpc('caregiver_push_tokens', { target_profiles: profileIds });
  if (tokenError) return json({ error: tokenError.message }, 500);

  const messages = ((tokens ?? []) as { profile_id: string; expo_push_token: string }[]).map((row) => ({
    to: row.expo_push_token,
    sound: 'default',
    channelId: 'medicine-reminders',
    title: 'Moje léky',
    body: 'Některá dávka zůstala nepotvrzená. Otevřete aplikaci a zkontrolujte dnešní plán.',
    data: { route: '/(tabs)', profileId: row.profile_id },
  }));
  if (!messages.length) return json({ alerts: alerts!.length, sent: 0 });

  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { ...jsonHeaders, Authorization: `Bearer ${Deno.env.get('EXPO_ACCESS_TOKEN')}` },
    body: JSON.stringify(messages),
  });
  const result = await response.json() as { data?: ExpoTicket[] };

  // Tickets come back in message order; forget devices Expo reports as gone.
  const stale = (result.data ?? [])
    .map((ticket, index) => ticket.details?.error === 'DeviceNotRegistered' ? messages[index]!.to : null)
    .filter((token): token is string => Boolean(token));
  if (stale.length) await supabase.from('devices').delete().in('expo_push_token', stale);

  return json({ alerts: alerts!.length, sent: messages.length, removedDevices: stale.length });
});
