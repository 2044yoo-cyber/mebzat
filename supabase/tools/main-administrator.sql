-- Putting the main administrator on the right account.
--
--   Edit the handle on the line marked CHANGE THIS, then paste the whole file
--   into the Supabase SQL editor and run it.
--
-- Migration 0064 carried every existing administrator across and made the
-- longest-standing of them the owner, because somebody had to be and the first
-- one appointed is the least arbitrary choice available. If that landed on the
-- wrong account, this moves it.
--
-- ## Why this is a file you run by hand and not a button
--
-- `set_admin_member` cannot do it. That function refuses anybody who is not
-- already the owner, and it never sets is_owner — so there is no path from
-- inside Medosha for one owner to become another, by design: the account that
-- can hand out every permission on the platform is not something a session
-- should be able to move. Changing it takes database access, which is the
-- point.
--
-- ## What it does, and what it leaves alone
--
-- The old owner is not removed. They stay an administrator with every area,
-- because demoting somebody is a decision and this is not the place to make it
-- silently — use the Team page afterwards if that is what you want.
--
-- Nothing else is touched. No profile is created, no content changes, and
-- profiles.is_admin is left to the trigger from 0064 rather than written here.

do $$
declare
  -- CHANGE THIS to the handle of the account that should be in charge.
  wanted_username text := 'your-handle-here';

  target uuid;
  previous uuid;
begin
  select id into target from public.profiles where username = wanted_username;

  if target is null then
    raise exception 'no account with the handle %. Check profiles.username.', wanted_username;
  end if;

  select user_id into previous from public.admin_members where is_owner;

  if previous = target then
    raise notice 'Already the main administrator: %', wanted_username;
    return;
  end if;

  -- Every area, so an administrator who is later stepped down from owner is
  -- not left holding nothing. Ignored while they are the owner.
  insert into public.admin_members (user_id, is_owner, areas)
  values (target, false, enum_range(null::public.admin_area))
  on conflict (user_id) do nothing;

  -- Cleared first. `admin_members_one_owner` is an immediate unique index, so
  -- two owners cannot exist even for the length of a transaction — setting the
  -- new one before clearing the old is refused.
  update public.admin_members set is_owner = false where is_owner;
  update public.admin_members set is_owner = true, updated_at = now() where user_id = target;

  if previous is null then
    raise notice 'Main administrator is now %', wanted_username;
  else
    raise notice 'Main administrator moved to %. The previous one keeps every area.', wanted_username;
  end if;
end $$;

-- Who holds it now.
select
  coalesce(p.full_name, p.username, '(no name)') as person,
  p.username,
  case when m.is_owner then 'MAIN ADMINISTRATOR' else 'sub-administrator' end as role
from public.admin_members m
left join public.profiles p on p.id = m.user_id
order by m.is_owner desc, m.created_at;
