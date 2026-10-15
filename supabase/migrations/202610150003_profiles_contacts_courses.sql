-- Managing people and contacts, medication instructions and limited courses.

alter table public.care_profiles add column color text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$');
alter table public.medications add column note text check (note is null or char_length(note) <= 500);
alter table public.regimen_rules add column ends_on date;
alter table public.prescriber_contacts add column kind text not null default 'doctor' check (kind in ('doctor', 'pharmacy'));

-- Creates a profile (caller becomes its owner) or updates one the caller cares for.
create or replace function public.upsert_family_profile(requested_id uuid, requested_name text, requested_color text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  inserted_profile uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.care_profiles(id, display_name, color)
  values (requested_id, requested_name, requested_color)
  on conflict (id) do nothing
  returning id into inserted_profile;

  if inserted_profile is not null then
    insert into public.memberships(profile_id, user_id, role) values (requested_id, auth.uid(), 'owner');
  elsif exists(select 1 from public.memberships
               where profile_id = requested_id and user_id = auth.uid() and role in ('owner', 'caregiver')) then
    update public.care_profiles set display_name = requested_name, color = requested_color where id = requested_id;
  else
    raise exception 'Only owners and caregivers can change this profile';
  end if;
end;
$$;

-- The owner deletes the profile with all its data; anyone else only leaves it.
create or replace function public.remove_family_profile(target_profile uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if exists(select 1 from public.memberships where profile_id = target_profile and user_id = auth.uid() and role = 'owner') then
    delete from public.care_profiles where id = target_profile;
  else
    delete from public.memberships where profile_id = target_profile and user_id = auth.uid();
  end if;
end;
$$;

revoke all on function public.upsert_family_profile(uuid, text, text) from public, anon;
revoke all on function public.remove_family_profile(uuid) from public, anon;
grant execute on function public.upsert_family_profile(uuid, text, text) to authenticated;
grant execute on function public.remove_family_profile(uuid) to authenticated;

create or replace function public.apply_mobile_mutation(mutation_id text, entity_name text, body jsonb)
returns boolean language plpgsql security invoker as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if exists(select 1 from public.mobile_mutations where id = mutation_id and user_id = auth.uid()) then
    return false;
  end if;

  if entity_name = 'dose_action' then
    insert into public.dose_actions(id, occurrence_id, medication_id, profile_id, scheduled_at, amount, status, recorded_at, recorded_by)
    values ((body->>'id')::uuid, body->>'occurrenceId', (body->>'medicationId')::uuid, (body->>'profileId')::uuid,
      (body->>'scheduledAt')::timestamptz, (body->>'amount')::numeric, (body->>'status')::public.dose_action_status,
      (body->>'recordedAt')::timestamptz, auth.uid())
    on conflict (occurrence_id) do update set status = excluded.status, recorded_at = excluded.recorded_at, recorded_by = excluded.recorded_by;
  elsif entity_name = 'dose_action_undo' then
    -- RLS (actions_member_all) limits the delete to profiles the caller belongs to.
    delete from public.dose_actions where occurrence_id = body->>'occurrenceId';
  elsif entity_name = 'inventory_event' then
    insert into public.inventory_events(id, medication_id, kind, quantity, occurred_at, note)
    values ((body->>'id')::uuid, (body->>'medicationId')::uuid, body->>'kind', (body->>'quantity')::numeric,
      (body->>'occurredAt')::timestamptz, nullif(body->>'note', ''))
    on conflict (id) do nothing;
  elsif entity_name = 'medication' then
    insert into public.medications(id, profile_id, name, strength, package_size, unit, prescription, erecept_id, note, active, created_at)
    values (((body->'medication')->>'id')::uuid, ((body->'medication')->>'profileId')::uuid,
      (body->'medication')->>'name', nullif((body->'medication')->>'strength', ''), ((body->'medication')->>'packageSize')::numeric,
      ((body->'medication')->>'unit')::public.dose_unit, coalesce(((body->'medication')->>'prescription')::boolean, false),
      nullif((body->'medication')->>'ereceptId', ''), nullif((body->'medication')->>'note', ''),
      coalesce(((body->'medication')->>'active')::boolean, true), ((body->'medication')->>'createdAt')::timestamptz)
    on conflict (id) do update set name = excluded.name, strength = excluded.strength, package_size = excluded.package_size,
      unit = excluded.unit, prescription = excluded.prescription, erecept_id = excluded.erecept_id, note = excluded.note,
      active = excluded.active;
    insert into public.regimen_rules(id, medication_id, effective_from, days_of_week, times, as_needed, ends_on)
    values (((body->'regimen')->>'id')::uuid, ((body->'regimen')->>'medicationId')::uuid,
      ((body->'regimen')->>'effectiveFrom')::date,
      array(select jsonb_array_elements_text((body->'regimen')->'daysOfWeek'))::smallint[],
      (body->'regimen')->'times', coalesce(((body->'regimen')->>'asNeeded')::boolean, false),
      nullif((body->'regimen')->>'endsOn', '')::date)
    on conflict (id) do update set effective_from = excluded.effective_from, days_of_week = excluded.days_of_week,
      times = excluded.times, as_needed = excluded.as_needed, ends_on = excluded.ends_on;
    if jsonb_typeof(body->'inventory') = 'object' then
      insert into public.inventory_events(id, medication_id, kind, quantity, occurred_at, note)
      values (((body->'inventory')->>'id')::uuid, ((body->'inventory')->>'medicationId')::uuid,
        (body->'inventory')->>'kind', ((body->'inventory')->>'quantity')::numeric,
        ((body->'inventory')->>'occurredAt')::timestamptz, nullif((body->'inventory')->>'note', ''))
      on conflict (id) do nothing;
    end if;
  elsif entity_name = 'prescriber' then
    insert into public.prescriber_contacts(id, profile_id, kind, name, phone, email)
    values ((body->>'id')::uuid, (body->>'profileId')::uuid, coalesce(body->>'kind', 'doctor'), body->>'name',
      nullif(body->>'phone', ''), nullif(body->>'email', ''))
    on conflict (id) do update set kind = excluded.kind, name = excluded.name, phone = excluded.phone, email = excluded.email;
  elsif entity_name = 'prescriber_remove' then
    delete from public.prescriber_contacts where id = (body->>'id')::uuid;
  elsif entity_name = 'profile' then
    perform public.upsert_family_profile((body->>'id')::uuid, body->>'displayName', nullif(body->>'color', ''));
  elsif entity_name = 'profile_remove' then
    perform public.remove_family_profile((body->>'id')::uuid);
  elsif entity_name = 'rx_request' then
    insert into public.rx_requests(id, profile_id, medication_id, status, channel, message, created_at, sent_at, completed_at)
    values ((body->>'id')::uuid, (body->>'profileId')::uuid, (body->>'medicationId')::uuid,
      (body->>'status')::public.rx_request_status, body->>'channel', body->>'message',
      (body->>'createdAt')::timestamptz, nullif(body->>'sentAt', '')::timestamptz, nullif(body->>'completedAt', '')::timestamptz)
    on conflict (id) do update set status = excluded.status, sent_at = excluded.sent_at, completed_at = excluded.completed_at;
  else
    raise exception 'Unsupported mutation entity: %', entity_name;
  end if;

  insert into public.mobile_mutations(id, user_id, entity_name, body)
  values (mutation_id, auth.uid(), entity_name, body)
  on conflict (id) do nothing;
  return true;
end;
$$;

-- Same as 202610150002, plus: no alerts after the last day of a course.
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
      and (regimen.ends_on is null or day.local_date <= regimen.ends_on)
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
