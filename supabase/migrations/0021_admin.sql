-- Admin flag.
--
-- Medosha has had no notion of an operator until now. The provider
-- diagnostics page needs one: it reports which keys are rejected, which
-- accounts are out of credit and what the last error from each provider was —
-- an operational view of the deployment, not something every signed-in user
-- should be able to read.
--
-- Deliberately a column rather than a role table. There is exactly one
-- privilege in the system today, and a join table for one boolean is a
-- structure built for a requirement nobody has stated.

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

comment on column public.profiles.is_admin is
  'Grants access to operational pages such as AI provider diagnostics. Set manually; never self-service.';

-- Read-only helper, so a policy can ask the question without recursing
-- through the profiles policies themselves.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- Admins may read every usage log, which is what makes the diagnostics page
-- able to report on the deployment rather than on the reader's own history.
do $$
begin
  if exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'ai_usage_logs'
  ) then
    drop policy if exists "admins read all ai usage" on public.ai_usage_logs;
    create policy "admins read all ai usage"
      on public.ai_usage_logs
      for select
      to authenticated
      using (public.is_admin());
  end if;
end
$$;

-- Nobody may grant themselves the flag. The column is writable only by the
-- service role and by direct SQL, which is the intent: an admin is made by
-- someone with database access, not by a request.
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles: no self promotion'
  ) then
    drop policy "profiles: no self promotion" on public.profiles;
  end if;
end
$$;

create or replace function public.prevent_admin_self_grant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The service role bypasses RLS and legitimately sets this; a normal
  -- authenticated session must never change its own flag.
  if auth.uid() is not null and new.is_admin is distinct from old.is_admin then
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
