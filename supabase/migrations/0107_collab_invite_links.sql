-- Invitation links for a project's Collaborative Studio.
--
-- Until now somebody joined a project only by being invited by email and
-- accepting. A link is what a client or a consultant actually gets sent, so
-- the owner can now make one — but a link travels, and the rules below are
-- what keep a forwarded link from being a way in for anybody who finds it:
--
--   * The token is 256 random bits made by the server and shown to the owner
--     once. Only its SHA-256 is stored, so the table can be read (by the
--     owner) without anything in it opening the project.
--   * A link expires — within 30 days at most — and is good for a set number
--     of people, one by default. The owner can withdraw it at any time.
--   * It never makes anybody an owner: not the Studio's owner level, and not
--     an Agenda role that `agenda_is_owner` treats as one (client,
--     administrator). Edit access is something the owner chooses, never the
--     default; a link is for commenting unless the owner says otherwise.
--   * It needs a signed-in Medosha account. Nothing here is granted to `anon`.
--   * Somebody already on the project keeps exactly the access they have, and
--     somebody the owner removed is not let back in by a link.
--
-- Joining runs in one security-definer function that checks all of that under
-- a row lock, so two people using the last place on a link at once cannot
-- both get in.

begin;

create table if not exists public.collab_invites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.agenda_projects (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  level public.collab_access_level not null default 'commenter'
    check (level in ('editor', 'commenter', 'viewer')),
  role public.agenda_role not null default 'employee'
    check (role not in ('client', 'administrator')),
  label text check (label is null or char_length(label) <= 80),
  max_uses integer not null default 1 check (max_uses between 1 and 100),
  uses integer not null default 0 check (uses >= 0 and uses <= max_uses),
  expires_at timestamptz not null default now() + interval '7 days',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id) on delete set null,
  constraint collab_invites_window check (expires_at > created_at and expires_at <= created_at + interval '30 days')
);

comment on table public.collab_invites is
  'Links that let somebody join a project''s Studio. Only a hash of each token is kept.';

create index if not exists collab_invites_project_idx on public.collab_invites (project_id, created_at desc);

-- Which link gave somebody their level, so "who let them in" has an answer.
alter table public.collab_access
  add column if not exists invite_id uuid references public.collab_invites (id) on delete set null;

-- ---------------------------------------------------------------------------
-- The token
-- ---------------------------------------------------------------------------

create or replace function public.collab_token_hash(invite_token text)
returns text
language sql
immutable
set search_path = public
as $$ select encode(sha256(convert_to(invite_token, 'UTF8')), 'hex'); $$;

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------

/** Made by the owner, as the owner; afterwards only withdrawn, or used. */
create or replace function public.collab_invite_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
    new.uses := 0;
    new.revoked_at := null;
    new.revoked_by := null;
    return new;
  end if;

  if (to_jsonb(new) - 'revoked_at' - 'revoked_by' - 'uses')
     is distinct from (to_jsonb(old) - 'revoked_at' - 'revoked_by' - 'uses') then
    raise exception 'An invitation link is not edited. Withdraw it and make another.'
      using errcode = 'check_violation';
  end if;
  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'A withdrawn link stays withdrawn.' using errcode = 'check_violation';
  end if;
  if new.revoked_at is not null and old.revoked_at is null then
    new.revoked_at := now();
    new.revoked_by := auth.uid();
  else
    new.revoked_by := old.revoked_by;
  end if;
  if new.uses < old.uses or new.uses > old.uses + 1 then
    raise exception 'A link is used by one person at a time.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists collab_invite_guard on public.collab_invites;
create trigger collab_invite_guard
  before insert or update on public.collab_invites
  for each row execute function public.collab_invite_guard();

/**
 * 0105's guard on levels, now also saying which link a level came from: a
 * level given by a link is recorded as given by the person who made the link,
 * not by the person who used it.
 */
create or replace function public.collab_access_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and (new.project_id <> old.project_id or new.user_id <> old.user_id) then
    raise exception 'A Studio level stays with the member it was given to.' using errcode = 'check_violation';
  end if;
  if not exists (
    select 1 from public.agenda_members m
    where m.project_id = new.project_id and m.user_id = new.user_id
      and m.status in ('invited', 'active')
  ) then
    raise exception 'That person is not on this project.' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' and new.invite_id is not null then
    select i.created_by into new.granted_by
    from public.collab_invites i
    where i.id = new.invite_id and i.project_id = new.project_id;
    if not found then
      raise exception 'That invitation is not for this project.' using errcode = 'check_violation';
    end if;
  else
    -- Set by a person: theirs, and no longer the link's.
    new.granted_by := auth.uid();
    new.invite_id := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reading a link before using it, and using it
-- ---------------------------------------------------------------------------

/**
 * What a link is for, so the page can say "Hanna invites you to comment on
 * Villa extension" before anybody presses anything — or why it will not work.
 * Nothing for a token that matches no link, and nothing without a sign-in.
 */
create or replace function public.collab_invite_preview(invite_token text)
returns table (
  project_id uuid,
  project_name text,
  level public.collab_access_level,
  role public.agenda_role,
  invited_by text,
  expires_at timestamptz,
  state text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    i.project_id,
    p.name,
    i.level,
    i.role,
    coalesce(pr.full_name, pr.company_name, pr.username, 'Someone'),
    i.expires_at,
    case
      when m.status = 'active' or p.owner_id = auth.uid() then 'member'
      when m.status in ('removed', 'suspended') then 'removed'
      when i.revoked_at is not null then 'revoked'
      when i.expires_at <= now() then 'expired'
      when i.uses >= i.max_uses then 'used'
      else 'ok'
    end
  from public.collab_invites i
  join public.agenda_projects p on p.id = i.project_id
  left join public.profiles pr on pr.id = i.created_by
  left join public.agenda_members m on m.project_id = i.project_id and m.user_id = auth.uid()
  where auth.uid() is not null
    and char_length(invite_token) between 20 and 200
    and i.token_hash = public.collab_token_hash(invite_token);
$$;

/** Joins the project the link is for. Returns the project. */
create or replace function public.collab_accept_invite(invite_token text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  invite public.collab_invites%rowtype;
  membership public.agenda_members%rowtype;
  who text;
begin
  if me is null then
    raise exception 'Sign in to accept the invitation.' using errcode = 'insufficient_privilege';
  end if;
  if invite_token is null or char_length(invite_token) not between 20 and 200 then
    raise exception 'This invitation link is not valid.' using errcode = 'no_data_found';
  end if;

  select * into invite from public.collab_invites
  where token_hash = public.collab_token_hash(invite_token)
  for update;
  if not found then
    raise exception 'This invitation link is not valid.' using errcode = 'no_data_found';
  end if;

  select * into membership from public.agenda_members
  where project_id = invite.project_id and user_id = me;

  -- Already in: nothing changes, and no place on the link is used.
  if membership.status = 'active'
     or exists (select 1 from public.agenda_projects where id = invite.project_id and owner_id = me) then
    return invite.project_id;
  end if;
  if membership.status in ('removed', 'suspended') then
    raise exception 'Your access to this project was removed. Ask the project owner to add you again.'
      using errcode = 'insufficient_privilege';
  end if;

  if invite.revoked_at is not null then
    raise exception 'This invitation link was withdrawn.' using errcode = 'check_violation';
  end if;
  if invite.expires_at <= now() then
    raise exception 'This invitation link has expired.' using errcode = 'check_violation';
  end if;
  if invite.uses >= invite.max_uses then
    raise exception 'This invitation link has already been used.' using errcode = 'check_violation';
  end if;

  if membership.id is not null then
    -- Invited by email as well: accepted, with the role they were invited as.
    update public.agenda_members set status = 'active', accepted_at = now()
    where id = membership.id;
  else
    insert into public.agenda_members (project_id, user_id, role, status, invited_by, invited_at, accepted_at)
    values (invite.project_id, me, invite.role, 'active', invite.created_by, now(), now());
  end if;

  insert into public.collab_access (project_id, user_id, level, invite_id)
  values (invite.project_id, me, invite.level, invite.id)
  on conflict (project_id, user_id) do nothing;

  update public.collab_invites set uses = uses + 1 where id = invite.id;

  select coalesce(full_name, company_name, username, 'Someone') into who from public.profiles where id = me;
  perform public.agenda_log_event(
    invite.project_id, 'collab', coalesce(who, 'Someone') || ' joined with an invitation link',
    null, 'collab_invites', invite.id);

  return invite.project_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Who may see and make links: the owner
-- ---------------------------------------------------------------------------

alter table public.collab_invites enable row level security;

drop policy if exists "collab invites: owner reads" on public.collab_invites;
create policy "collab invites: owner reads" on public.collab_invites
  for select to authenticated using (public.collab_level(project_id) = 'owner');
drop policy if exists "collab invites: owner makes" on public.collab_invites;
create policy "collab invites: owner makes" on public.collab_invites
  for insert to authenticated with check (public.collab_level(project_id) = 'owner');
drop policy if exists "collab invites: owner withdraws" on public.collab_invites;
create policy "collab invites: owner withdraws" on public.collab_invites
  for update to authenticated
  using (public.collab_level(project_id) = 'owner')
  with check (public.collab_level(project_id) = 'owner');

revoke all on public.collab_invites from anon, public;
grant select, insert, update on public.collab_invites to authenticated;
revoke delete, truncate on public.collab_invites from authenticated;

revoke all on function public.collab_invite_preview(text) from public, anon;
revoke all on function public.collab_accept_invite(text) from public, anon;
grant execute on function public.collab_invite_preview(text) to authenticated;
grant execute on function public.collab_accept_invite(text) to authenticated;

commit;
