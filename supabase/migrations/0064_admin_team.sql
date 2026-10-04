-- One owner, and the people they trust with part of it.
--
-- ## What was missing
--
-- `profiles.is_admin` is a single boolean: you can do everything, or nothing.
-- That is the right shape for one operator and the wrong shape the moment a
-- second person is asked to help — somebody brought in to clear the report
-- queue should not also be able to restrict accounts or change prices, and
-- today the only way to let them do the first is to let them do all of it.
--
-- ## Why nothing existing covers it
--
-- user_strikes, moderation_audit and the profiles flag between them record
-- what an admin *did*. Nothing records what an admin *may* do. There is no
-- table with a subject, an area and a grant, and no amount of reading the
-- audit log answers "is this person allowed to press this button".
--
-- ## What this adds, and what it does not touch
--
-- One table and one enum. `profiles.is_admin` stays exactly as it is and stays
-- the gate for reaching /admin at all — every existing call to is_admin()
-- keeps working — and a trigger keeps it in step with membership so the two
-- can never disagree. Existing admins are carried across with every area, and
-- the longest-standing becomes the owner, so applying this changes nobody's
-- access on the day it runs.

do $$ begin
  create type public.admin_area as enum (
    'users',
    'properties',
    'products',
    'projects',
    'tours',
    'moderation',
    'content',
    'prices',
    'analytics',
    'security',
    'settings'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.admin_members (
  user_id uuid primary key references auth.users (id) on delete cascade,

  /** The main administrator. Holds every area implicitly and is the only
   * person who can add, change or remove another administrator. */
  is_owner boolean not null default false,

  /** What this person may do. Ignored for the owner, who may do everything —
   * storing a list for them would be a second answer to the same question and
   * a chance for the two to disagree. */
  areas public.admin_area[] not null default '{}',

  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Exactly one owner. Two is an argument nobody can settle, and none is a
-- platform where administrators can no longer be added.
create unique index if not exists admin_members_one_owner
  on public.admin_members ((true)) where is_owner;

create index if not exists admin_members_owner_idx
  on public.admin_members (is_owner) where is_owner;

-- ------------------------------------------------------ profiles stays in step

-- ------------------------------------------- correcting the guard from 0021
--
-- prevent_admin_self_grant refuses any change to profiles.is_admin when
-- `auth.uid() is not null`. That is the right intent expressed the wrong way,
-- and it blocks the sync below: a `security definer` function changes the
-- privilege, not the JWT, so auth.uid() is still the caller inside one and the
-- trigger fires on privileged code the operator wrote.
--
-- The rule it means is "not from an API session", and the way to say that is
-- the role the statement is running under. Which requires the trigger to be
-- `security invoker` — as a definer it runs as its owner and `current_user`
-- could never be an API role, so the test could never fire and the guard would
-- read as protection while permitting everything.
--
-- This is not a loosening. A direct UPDATE from an authenticated session is
-- still refused, and supabase/tests/admin-team.sql asserts exactly that.
create or replace function public.prevent_admin_self_grant()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon')
     and new.is_admin is distinct from old.is_admin then
    raise exception 'is_admin cannot be changed from an authenticated session';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_admin_self_grant on public.profiles;
create trigger prevent_admin_self_grant
  before update on public.profiles
  for each row
  execute function public.prevent_admin_self_grant();

/** `profiles.is_admin` remains what every existing call reads, and is kept
 * true for exactly the people in this table. Two sources of the same fact is
 * how one of them ends up wrong. */
create or replace function public.sync_admin_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare target uuid := coalesce(new.user_id, old.user_id);
begin
  update public.profiles
  set is_admin = exists (select 1 from public.admin_members where user_id = target)
  where id = target;
  return coalesce(new, old);
end;
$$;

drop trigger if exists sync_admin_flag on public.admin_members;
create trigger sync_admin_flag
  after insert or update or delete on public.admin_members
  for each row
  execute function public.sync_admin_flag();

-- ----------------------------------------------------------------- may they?

/**
 * Whether the caller may act in this area.
 *
 * The owner may do anything. Everyone else may do what they were given. A
 * person who is not an administrator at all falls through both and gets false,
 * which is the same answer as an administrator with no areas — correctly, in
 * both cases nothing is permitted.
 */
create or replace function public.admin_can(area public.admin_area)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_members m
    where m.user_id = auth.uid()
      and (m.is_owner or area = any(m.areas))
  );
$$;

grant execute on function public.admin_can(public.admin_area) to authenticated;

/** Every area this caller holds, for building a menu that shows only what the
 * person can actually open. The owner gets the full list. */
create or replace function public.my_admin_areas()
returns public.admin_area[]
language sql
stable
security definer
set search_path = public
as $$
  select case
    when m.is_owner then enum_range(null::public.admin_area)
    else m.areas
  end
  from public.admin_members m
  where m.user_id = auth.uid();
$$;

grant execute on function public.my_admin_areas() to authenticated;

/**
 * Whether the caller is on the team at all.
 *
 * `security definer`, and that is not incidental: the select policy on
 * admin_members below asks this question, and a policy that queries the table
 * it is protecting recurses forever — "infinite recursion detected in policy
 * for relation admin_members", which is how the first version of this file
 * failed. A definer function runs outside the policy and breaks the cycle.
 */
create or replace function public.is_admin_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admin_members where user_id = auth.uid());
$$;

grant execute on function public.is_admin_member() to authenticated;

create or replace function public.is_admin_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_members where user_id = auth.uid() and is_owner
  );
$$;

grant execute on function public.is_admin_owner() to authenticated;

-- ------------------------------------------------------------ managing the team

/**
 * Add an administrator, or change what one may do.
 *
 * Owner only. The owner's own row is refused here: an owner who can edit their
 * own areas can remove them, and an owner with no areas is still the owner —
 * so the operation would do nothing while appearing to work. Handing the
 * ownership on is a separate, deliberate thing and is not in this function.
 */
create or replace function public.set_admin_member(
  target uuid,
  areas public.admin_area[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_owner() then
    raise exception 'only the main administrator can change the team';
  end if;

  if target = auth.uid() then
    raise exception 'the main administrator cannot change their own access';
  end if;

  if exists (select 1 from public.admin_members where user_id = target and is_owner) then
    raise exception 'the main administrator cannot be changed from here';
  end if;

  insert into public.admin_members (user_id, is_owner, areas, granted_by)
  values (target, false, coalesce(areas, '{}'), auth.uid())
  on conflict (user_id) do update
    set areas = coalesce(excluded.areas, '{}'),
        granted_by = auth.uid(),
        updated_at = now();
end;
$$;

revoke all on function public.set_admin_member(uuid, public.admin_area[]) from public;
grant execute on function public.set_admin_member(uuid, public.admin_area[]) to authenticated;

/** Remove an administrator. The owner cannot be removed — a platform with no
 * owner has no way to appoint one. */
create or replace function public.remove_admin_member(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_owner() then
    raise exception 'only the main administrator can change the team';
  end if;

  if exists (select 1 from public.admin_members where user_id = target and is_owner) then
    raise exception 'the main administrator cannot be removed';
  end if;

  delete from public.admin_members where user_id = target;
end;
$$;

revoke all on function public.remove_admin_member(uuid) from public;
grant execute on function public.remove_admin_member(uuid) to authenticated;

-- --------------------------------------------------------------- row security

alter table public.admin_members enable row level security;

grant select on public.admin_members to authenticated;

/** An administrator may see the team. Nobody else may see that it exists —
 * the list of who can moderate is a list of who to pressure. */
drop policy if exists "Admins see the team" on public.admin_members;
create policy "Admins see the team"
  on public.admin_members for select
  to authenticated
  using (public.is_admin_member());

-- No insert, update or delete policy at all: every write goes through the two
-- security-definer functions above, which check that the caller is the owner.
-- A policy permitting writes would be a second door to the same room.

-- ------------------------------------------------------------------ the carry

/**
 * Everyone who is an administrator today stays one, with everything.
 *
 * Applying this must not change anybody's access on the day it runs. The
 * longest-standing becomes the owner, because somebody has to be and the first
 * one appointed is the least arbitrary choice available.
 */
insert into public.admin_members (user_id, is_owner, areas)
select
  p.id,
  false,
  enum_range(null::public.admin_area)
from public.profiles p
where p.is_admin
on conflict (user_id) do nothing;

update public.admin_members
set is_owner = true
where user_id = (
  select m.user_id
  from public.admin_members m
  join public.profiles p on p.id = m.user_id
  order by p.created_at nulls last, m.created_at
  limit 1
)
and not exists (select 1 from public.admin_members where is_owner);
