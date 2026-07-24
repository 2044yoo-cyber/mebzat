-- Tracks real profile view counts, shown on the dashboard stats and the
-- owner's own profile header. Incremented via RPC (not a direct UPDATE)
-- because the profiles RLS update policy is owner-only — viewers aren't
-- the owner, so this needs a security definer function to bypass that
-- narrowly, for this one counter.

alter table public.profiles add column profile_views integer not null default 0;

create function public.increment_profile_views(profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set profile_views = profile_views + 1
  where id = profile_id;
end;
$$;

grant execute on function public.increment_profile_views(uuid) to anon, authenticated;
