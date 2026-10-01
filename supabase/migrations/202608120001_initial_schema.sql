create extension if not exists pgcrypto;

create type public.family_role as enum ('owner', 'caregiver', 'senior');
create type public.dose_unit as enum ('tablet', 'capsule');
create type public.dose_action_status as enum ('taken', 'skipped');
create type public.rx_request_status as enum ('draft', 'sent', 'completed', 'dismissed');

create table public.care_profiles (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(display_name) between 1 and 120),
  timezone text not null default 'Europe/Prague',
  created_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.care_profiles on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role public.family_role not null,
  created_at timestamptz not null default now(),
  unique (profile_id, user_id)
);

create table public.medications (
  id uuid primary key,
  profile_id uuid not null references public.care_profiles on delete cascade,
  name text not null check (char_length(name) between 1 and 180),
  strength text,
  package_size numeric(8,2) not null check (package_size > 0),
  unit public.dose_unit not null,
  prescription boolean not null default false,
  erecept_id text check (erecept_id is null or erecept_id ~ '^[A-Z0-9]{12}$'),
  sukl_code text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.regimen_rules (
  id uuid primary key,
  medication_id uuid not null references public.medications on delete cascade,
  effective_from date not null,
  days_of_week smallint[] not null check (days_of_week <@ array[0,1,2,3,4,5,6]::smallint[]),
  times jsonb not null,
  as_needed boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.inventory_events (
  id uuid primary key,
  medication_id uuid not null references public.medications on delete cascade,
  kind text not null check (kind in ('initial', 'refill', 'correction')),
  quantity numeric(8,2) not null,
  occurred_at timestamptz not null,
  note text
);

create table public.dose_actions (
  id uuid primary key,
  occurrence_id text not null unique,
  medication_id uuid not null references public.medications on delete cascade,
  profile_id uuid not null references public.care_profiles on delete cascade,
  scheduled_at timestamptz not null,
  amount numeric(8,2) not null check (amount > 0),
  status public.dose_action_status not null,
  recorded_at timestamptz not null,
  recorded_by uuid references auth.users
);

create table public.prescriber_contacts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.care_profiles on delete cascade,
  name text not null,
  phone text,
  email text
);

create table public.rx_requests (
  id uuid primary key,
  profile_id uuid not null references public.care_profiles on delete cascade,
  medication_id uuid not null references public.medications on delete cascade,
  status public.rx_request_status not null default 'draft',
  channel text not null check (channel in ('sms', 'email', 'share')),
  message text not null,
  created_at timestamptz not null,
  sent_at timestamptz,
  completed_at timestamptz
);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  expo_push_token text not null unique,
  platform text not null check (platform in ('android', 'ios')),
  updated_at timestamptz not null default now()
);

create table public.mobile_mutations (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  entity_name text not null,
  body jsonb not null,
  applied_at timestamptz not null default now()
);

create or replace function public.is_profile_member(target_profile uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.memberships where profile_id = target_profile and user_id = auth.uid());
$$;

alter table public.care_profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.medications enable row level security;
alter table public.regimen_rules enable row level security;
alter table public.inventory_events enable row level security;
alter table public.dose_actions enable row level security;
alter table public.prescriber_contacts enable row level security;
alter table public.rx_requests enable row level security;
alter table public.devices enable row level security;
alter table public.mobile_mutations enable row level security;

create policy profiles_member_read on public.care_profiles for select using (public.is_profile_member(id));
create policy memberships_member_read on public.memberships for select using (public.is_profile_member(profile_id));
create policy medications_member_all on public.medications for all using (public.is_profile_member(profile_id)) with check (public.is_profile_member(profile_id));
create policy regimens_member_all on public.regimen_rules for all using (public.is_profile_member((select profile_id from public.medications where id = medication_id))) with check (public.is_profile_member((select profile_id from public.medications where id = medication_id)));
create policy inventory_member_all on public.inventory_events for all using (public.is_profile_member((select profile_id from public.medications where id = medication_id))) with check (public.is_profile_member((select profile_id from public.medications where id = medication_id)));
create policy actions_member_all on public.dose_actions for all using (public.is_profile_member(profile_id)) with check (public.is_profile_member(profile_id));
create policy prescribers_member_all on public.prescriber_contacts for all using (public.is_profile_member(profile_id)) with check (public.is_profile_member(profile_id));
create policy requests_member_all on public.rx_requests for all using (public.is_profile_member(profile_id)) with check (public.is_profile_member(profile_id));
create policy own_devices on public.devices for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_mutations on public.mobile_mutations for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.bootstrap_family_profile(requested_id uuid, requested_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  inserted_profile uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.care_profiles(id, display_name)
  values (requested_id, requested_name)
  on conflict (id) do nothing
  returning id into inserted_profile;

  if inserted_profile is not null then
    insert into public.memberships(profile_id, user_id, role)
    values (requested_id, auth.uid(), 'owner');
  elsif not public.is_profile_member(requested_id) then
    raise exception 'Profile already belongs to another family';
  end if;
end;
$$;

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
  elsif entity_name = 'inventory_event' then
    insert into public.inventory_events(id, medication_id, kind, quantity, occurred_at, note)
    values ((body->>'id')::uuid, (body->>'medicationId')::uuid, body->>'kind', (body->>'quantity')::numeric,
      (body->>'occurredAt')::timestamptz, nullif(body->>'note', ''))
    on conflict (id) do nothing;
  elsif entity_name = 'medication' then
    insert into public.medications(id, profile_id, name, strength, package_size, unit, prescription, erecept_id, active, created_at)
    values (((body->'medication')->>'id')::uuid, ((body->'medication')->>'profileId')::uuid,
      (body->'medication')->>'name', nullif((body->'medication')->>'strength', ''), ((body->'medication')->>'packageSize')::numeric,
      ((body->'medication')->>'unit')::public.dose_unit, coalesce(((body->'medication')->>'prescription')::boolean, false),
      nullif((body->'medication')->>'ereceptId', ''), true, ((body->'medication')->>'createdAt')::timestamptz)
    on conflict (id) do update set name = excluded.name, strength = excluded.strength, package_size = excluded.package_size,
      unit = excluded.unit, prescription = excluded.prescription, erecept_id = excluded.erecept_id, active = excluded.active;
    insert into public.regimen_rules(id, medication_id, effective_from, days_of_week, times, as_needed)
    values (((body->'regimen')->>'id')::uuid, ((body->'regimen')->>'medicationId')::uuid,
      ((body->'regimen')->>'effectiveFrom')::date,
      array(select jsonb_array_elements_text((body->'regimen')->'daysOfWeek'))::smallint[],
      (body->'regimen')->'times', coalesce(((body->'regimen')->>'asNeeded')::boolean, false))
    on conflict (id) do update set effective_from = excluded.effective_from, days_of_week = excluded.days_of_week,
      times = excluded.times, as_needed = excluded.as_needed;
    insert into public.inventory_events(id, medication_id, kind, quantity, occurred_at)
    values (((body->'inventory')->>'id')::uuid, ((body->'inventory')->>'medicationId')::uuid,
      (body->'inventory')->>'kind', ((body->'inventory')->>'quantity')::numeric,
      ((body->'inventory')->>'occurredAt')::timestamptz)
    on conflict (id) do nothing;
  elsif entity_name = 'prescriber' then
    insert into public.prescriber_contacts(id, profile_id, name, phone, email)
    values ((body->>'id')::uuid, (body->>'profileId')::uuid, body->>'name',
      nullif(body->>'phone', ''), nullif(body->>'email', ''))
    on conflict (id) do update set name = excluded.name, phone = excluded.phone, email = excluded.email;
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

create table public.sukl_catalog (
  sukl_code text primary key,
  name text not null,
  strength text,
  pharmaceutical_form text,
  package_label text,
  updated_at timestamptz not null default now()
);
alter table public.sukl_catalog enable row level security;
create policy catalog_authenticated_read on public.sukl_catalog for select to authenticated using (true);
