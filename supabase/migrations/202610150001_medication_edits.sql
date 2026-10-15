-- Supports editing and ending a medication, inventory notes and undoing a dose.
-- Changes against 202608120001:
--   medication: honours body.medication.active (was always true) and the
--               inventory event is optional (an edit without a stock change).
--   inventory events keep their note.
--   dose_action_undo: removes the action for one occurrence.

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
    insert into public.medications(id, profile_id, name, strength, package_size, unit, prescription, erecept_id, active, created_at)
    values (((body->'medication')->>'id')::uuid, ((body->'medication')->>'profileId')::uuid,
      (body->'medication')->>'name', nullif((body->'medication')->>'strength', ''), ((body->'medication')->>'packageSize')::numeric,
      ((body->'medication')->>'unit')::public.dose_unit, coalesce(((body->'medication')->>'prescription')::boolean, false),
      nullif((body->'medication')->>'ereceptId', ''), coalesce(((body->'medication')->>'active')::boolean, true),
      ((body->'medication')->>'createdAt')::timestamptz)
    on conflict (id) do update set name = excluded.name, strength = excluded.strength, package_size = excluded.package_size,
      unit = excluded.unit, prescription = excluded.prescription, erecept_id = excluded.erecept_id, active = excluded.active;
    insert into public.regimen_rules(id, medication_id, effective_from, days_of_week, times, as_needed)
    values (((body->'regimen')->>'id')::uuid, ((body->'regimen')->>'medicationId')::uuid,
      ((body->'regimen')->>'effectiveFrom')::date,
      array(select jsonb_array_elements_text((body->'regimen')->'daysOfWeek'))::smallint[],
      (body->'regimen')->'times', coalesce(((body->'regimen')->>'asNeeded')::boolean, false))
    on conflict (id) do update set effective_from = excluded.effective_from, days_of_week = excluded.days_of_week,
      times = excluded.times, as_needed = excluded.as_needed;
    if jsonb_typeof(body->'inventory') = 'object' then
      insert into public.inventory_events(id, medication_id, kind, quantity, occurred_at, note)
      values (((body->'inventory')->>'id')::uuid, ((body->'inventory')->>'medicationId')::uuid,
        (body->'inventory')->>'kind', ((body->'inventory')->>'quantity')::numeric,
        ((body->'inventory')->>'occurredAt')::timestamptz, nullif((body->'inventory')->>'note', ''))
      on conflict (id) do nothing;
    end if;
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
