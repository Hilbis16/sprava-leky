import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = { 'Content-Type': 'application/json' };

Deno.serve(async (request) => {
  const secret = request.headers.get('x-cron-secret');
  if (!secret || secret !== Deno.env.get('CRON_SECRET')) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: devices, error } = await supabase.from('devices').select('expo_push_token');
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });

  // Production rule evaluation belongs in a database function. This endpoint is
  // intentionally generic and sends no medicine name in lock-screen content.
  const messages = (devices ?? []).map((device) => ({
    to: device.expo_push_token,
    sound: 'default',
    title: 'Moje léky',
    body: 'V aplikaci je nové upozornění, které vyžaduje vaši pozornost.',
    data: { route: '/(tabs)' },
  }));
  if (!messages.length) return new Response(JSON.stringify({ sent: 0 }), { headers: corsHeaders });
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('EXPO_ACCESS_TOKEN')}` },
    body: JSON.stringify(messages),
  });
  return new Response(JSON.stringify({ sent: messages.length, result: await response.json() }), { headers: corsHeaders });
});
