create table public.family_invites (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.care_profiles on delete cascade,
  token_hash bytea not null unique,
  role public.family_role not null check (role in ('caregiver', 'senior')),
  created_by uuid not null references auth.users on delete cascade,
  expires_at timestamptz not null,
  used_by uuid references auth.users on delete set null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index family_invites_expiry_idx on public.family_invites(expires_at) where used_at is null;
alter table public.family_invites enable row level security;

create or replace function public.create_family_invite(
  target_profile uuid,
  invited_role public.family_role default 'caregiver'
)
returns table(token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  raw_token text;
  invite_expiry timestamptz := now() + interval '24 hours';
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if invited_role not in ('caregiver', 'senior') then raise exception 'Unsupported invite role'; end if;
  if not exists (
    select 1 from public.memberships
    where profile_id = target_profile and user_id = auth.uid() and role in ('owner', 'caregiver')
  ) then
    raise exception 'Only a caregiver can invite family members';
  end if;

  raw_token := translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_');
  insert into public.family_invites(profile_id, token_hash, role, created_by, expires_at)
  values (target_profile, digest(raw_token, 'sha256'), invited_role, auth.uid(), invite_expiry);
  return query select raw_token, invite_expiry;
end;
$$;

create or replace function public.accept_family_invite(raw_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed public.family_invites%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if raw_token is null or char_length(raw_token) < 24 then raise exception 'Invalid invitation'; end if;

  select invite.* into claimed
  from public.family_invites invite
  where invite.token_hash = digest(raw_token, 'sha256')
    and invite.used_at is null
    and invite.expires_at > now()
  for update;

  if claimed.id is null then raise exception 'Invitation is invalid, expired, or already used'; end if;

  insert into public.memberships(profile_id, user_id, role)
  values (claimed.profile_id, auth.uid(), claimed.role)
  on conflict (profile_id, user_id) do nothing;

  update public.family_invites
  set used_by = auth.uid(), used_at = now()
  where id = claimed.id;

  return claimed.profile_id;
end;
$$;

revoke all on function public.create_family_invite(uuid, public.family_role) from public;
revoke all on function public.accept_family_invite(text) from public;
grant execute on function public.create_family_invite(uuid, public.family_role) to authenticated;
grant execute on function public.accept_family_invite(text) to authenticated;
