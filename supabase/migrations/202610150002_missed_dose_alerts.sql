-- Caregiver alerts for doses that stay unconfirmed.
-- The push-notifications edge function (run by cron) calls
-- claim_missed_dose_alerts, then sends a generic push to the devices of the
-- profile's owners and caregivers. Each missed dose is claimed only once.

create table public.missed_dose_alerts (
  medication_id uuid not null references public.medications on delete cascade,
  scheduled_at timestamptz not null,
  profile_id uuid not null references public.care_profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (medication_id, scheduled_at)
);

-- No policies: only the service role (which bypasses RLS) touches this table.
alter table public.missed_dose_alerts enable row level security;

-- Registers this device's Expo push token for the signed-in user. A token moves
-- to the latest user who registers it (reinstall, new anonymous account).
create or replace function public.register_push_device(push_token text, device_platform text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if push_token is null or push_token !~ '^Expo(nent)?PushToken\[[^]]+\]$' then raise exception 'Invalid push token'; end if;
  if device_platform not in ('android', 'ios') then raise exception 'Invalid platform'; end if;

  insert into public.devices(user_id, expo_push_token, platform)
  values (auth.uid(), push_token, device_platform)
  on conflict (expo_push_token) do update
    set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end;
$$;

-- Returns doses that were due at least delay_minutes ago, have no dose action
-- and were not claimed before. Doses older than lookback_hours are ignored, so
-- the first run after deployment does not flood caregivers with old history.
-- Occurrences are computed the same way as in the app (src/domain/schedule.ts):
-- local date + dose time in the profile's timezone, on the regimen's weekdays.
create or replace function public.claim_missed_dose_alerts(delay_minutes integer default 120, lookback_hours integer default 12)
returns table(profile_id uuid, medication_id uuid, scheduled_at timestamptz)
language sql
volatile
security definer
set search_path = ''
as $$
  with due as (
    select
      medication.profile_id,
      medication.id as medication_id,
      ((day.local_date + (dose->>'time')::time) at time zone profile.timezone) as scheduled_at
    from public.medications medication
    join public.care_profiles profile on profile.id = medication.profile_id
    join public.regimen_rules regimen on regimen.medication_id = medication.id
    cross join lateral (
      select series::date as local_date
      from generate_series(
        ((now() at time zone profile.timezone)::date - 1)::timestamp,
        (now() at time zone profile.timezone)::date::timestamp,
        interval '1 day'
      ) series
    ) day
    cross join lateral jsonb_array_elements(regimen.times) dose
    where medication.active
      and not regimen.as_needed
      and day.local_date >= regimen.effective_from
      and extract(dow from day.local_date)::smallint = any(regimen.days_of_week)
  )
  insert into public.missed_dose_alerts(medication_id, scheduled_at, profile_id)
  select due.medication_id, due.scheduled_at, due.profile_id
  from due
  where due.scheduled_at <= now() - make_interval(mins => delay_minutes)
    and due.scheduled_at > now() - make_interval(hours => greatest(lookback_hours, ceil(delay_minutes / 60.0)::integer + 1))
    and not exists (
      select 1 from public.dose_actions action
      where action.medication_id = due.medication_id and action.scheduled_at = due.scheduled_at
    )
  on conflict do nothing
  returning missed_dose_alerts.profile_id, missed_dose_alerts.medication_id, missed_dose_alerts.scheduled_at;
$$;

-- Push tokens of owners and caregivers (never seniors) of the given profiles.
create or replace function public.caregiver_push_tokens(target_profiles uuid[])
returns table(profile_id uuid, expo_push_token text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct membership.profile_id, device.expo_push_token
  from public.memberships membership
  join public.devices device on device.user_id = membership.user_id
  where membership.profile_id = any(target_profiles)
    and membership.role in ('owner', 'caregiver');
$$;

revoke all on function public.register_push_device(text, text) from public;
grant execute on function public.register_push_device(text, text) to authenticated;

revoke all on function public.claim_missed_dose_alerts(integer, integer) from public, anon, authenticated;
revoke all on function public.caregiver_push_tokens(uuid[]) from public, anon, authenticated;
grant execute on function public.claim_missed_dose_alerts(integer, integer) to service_role;
grant execute on function public.caregiver_push_tokens(uuid[]) to service_role;
