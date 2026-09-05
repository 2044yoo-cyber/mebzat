-- Which account is yours, and what it is called.
--
--   Paste into the Supabase SQL editor and run. Read-only.
--
-- main-administrator.sql needs a handle or an email address to point at. This
-- is where you get one. It lists accounts oldest first, because the account
-- you made when you first set Medosha up is almost always the one that should
-- be in charge, and it is the one at the top.
--
-- The email comes from auth.users. profiles.username can be null — a profile
-- made before a handle was asked for has none — which is why the address is
-- shown beside it and why main-administrator.sql accepts either.

select
  coalesce(p.full_name, '(no name)') as name,
  coalesce(p.username, '(no handle)') as handle,
  u.email,
  p.created_at::date as joined,
  case
    when m.is_owner then 'MAIN ADMINISTRATOR'
    when m.user_id is not null then 'sub-administrator'
    when p.is_admin then '** flagged but not on the team'
    else ''
  end as standing
from public.profiles p
join auth.users u on u.id = p.id
left join public.admin_members m on m.user_id = p.id
order by p.created_at nulls last
limit 25;
