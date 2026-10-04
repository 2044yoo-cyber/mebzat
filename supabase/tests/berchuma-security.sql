-- Berchuma Studio — what a client is and is not allowed to do.
--
-- Run this in the Supabase SQL editor after applying 0028 and 0029. It prints
-- one line per check and cleans up after itself.
--
-- It matters that it runs as `authenticated`, not as the editor's default
-- role. A superuser bypasses row-level security entirely, so a probe run as
-- one reports that every rule works and proves nothing. `set role
-- authenticated` below is the whole point of the file.
--
-- Three of these checks exist because the attack succeeded the first time it
-- was tried: a client could insert a design claiming to be a remix of
-- somebody else's work, open it with a remix count of 9999, and later update
-- its lineage and its owner. All three are now refused.

begin;

-- Two throwaway accounts. Rolled back at the end.
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'berchuma-probe-a@example.test'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'berchuma-probe-b@example.test');

create temporary table probe (name text, passed boolean, detail text);
-- The scratch table is created before the role switch, so it belongs to the
-- editor's role. Without this grant every check fails on the table it is
-- writing its result into rather than on the rule it is testing.
grant all on probe to authenticated;

-- ---------------------------------------------------------------------------
-- As user A
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';

insert into public.designs (slug, owner_id, kind, title, spec, visibility, published_at)
values
  ('probe-public', 'aaaaaaaa-0000-4000-8000-000000000001', 'wardrobe',
   'Probe public design', '{"version":1}'::jsonb, 'public', now()),
  ('probe-private', 'aaaaaaaa-0000-4000-8000-000000000001', 'wardrobe',
   'Probe private design', '{"version":1}'::jsonb, 'private', null);

insert into probe
select 'owner sees both of their own designs',
       count(*) = 2, count(*)::text
from public.designs where slug like 'probe-%';

-- ---------------------------------------------------------------------------
-- As user B
-- ---------------------------------------------------------------------------

set local request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000002';

insert into probe
select 'a private design is invisible to everyone else',
       count(*) = 0, count(*)::text
from public.designs where slug = 'probe-private';

insert into probe
select 'a public design is readable by anyone', count(*) = 1, count(*)::text
from public.designs where slug = 'probe-public';

-- Forging lineage on insert.
do $$
declare
  target uuid;
begin
  select id into target from public.designs where slug = 'probe-public';
  begin
    insert into public.designs (
      slug, owner_id, kind, title, spec, visibility,
      parent_design_id, root_design_id, remix_count
    )
    values (
      'probe-forged', 'aaaaaaaa-0000-4000-8000-000000000002', 'wardrobe',
      'Forged lineage', '{"version":1}'::jsonb, 'private', target, target, 9999
    );
    insert into probe values ('forged parentage on insert is refused', false, 'the insert succeeded');
  exception when others then
    insert into probe values ('forged parentage on insert is refused', true, sqlerrm);
  end;
end $$;

-- Forging lineage, ownership and counters on update.
insert into public.designs (slug, owner_id, kind, title, spec, visibility)
values ('probe-mine', 'aaaaaaaa-0000-4000-8000-000000000002', 'wardrobe',
        'Legitimately mine', '{"version":1}'::jsonb, 'private');

update public.designs
   set parent_design_id = (select id from public.designs where slug = 'probe-public'),
       root_design_id   = (select id from public.designs where slug = 'probe-public'),
       remix_count = 9999,
       view_count = 500000,
       slug = 'probe-stolen-slug',
       owner_id = 'aaaaaaaa-0000-4000-8000-000000000001'
 where slug = 'probe-mine';

insert into probe
select 'lineage, owner, slug and counters survive a hostile update',
       parent_design_id is null
         and root_design_id is null
         and remix_count = 0
         and view_count = 0
         and slug = 'probe-mine'
         and owner_id = 'aaaaaaaa-0000-4000-8000-000000000002',
       'slug=' || slug || ' remix=' || remix_count
from public.designs where owner_id = 'aaaaaaaa-0000-4000-8000-000000000002';

-- Writing to somebody else's design.
update public.designs set title = 'hijacked' where slug = 'probe-public';
insert into probe
select 'another user cannot edit your design', count(*) = 0, count(*)::text
from public.designs where title = 'hijacked';

-- Remixing a private design belonging to somebody else.
do $$
declare
  target uuid;
begin
  -- Found by id, the way an attacker would: RLS hides the row from a select,
  -- so the check inside the function is what has to refuse it.
  select id into target from public.designs where slug = 'probe-private';
  if target is null then
    -- Read is already blocked, which is the stronger result.
    insert into probe values ('a private design cannot be remixed', true, 'not even readable');
  else
    begin
      perform public.berchuma_remix(target);
      insert into probe values ('a private design cannot be remixed', false, 'the remix succeeded');
    exception when others then
      insert into probe values ('a private design cannot be remixed', true, sqlerrm);
    end;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The legitimate paths must still work
-- ---------------------------------------------------------------------------

do $$
declare
  source uuid;
  child uuid;
begin
  select id into source from public.designs where slug = 'probe-public';
  child := public.berchuma_remix(source, 'Probe remix');

  insert into probe
  select 'a remix records its parent and its root',
         d.parent_design_id = source and d.root_design_id = source,
         'parent=' || coalesce(d.parent_design_id::text, 'null')
  from public.designs d where d.id = child;

  insert into probe
  select 'a remix starts private', d.visibility = 'private', d.visibility::text
  from public.designs d where d.id = child;

  -- The counter bump has to survive the provenance trigger, which is the bug
  -- that guard introduced the first time it was written.
  insert into probe
  select 'the original remix count went up', d.remix_count = 1, d.remix_count::text
  from public.designs d where d.id = source;

  -- Counted as the recipient. A notification is readable only by the person
  -- it is for, so asking this question as the remixer returns zero and looks
  -- like the notification was never sent.
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
  insert into probe
  select 'the original author was notified', count(*) = 1, count(*)::text
  from public.notifications
  where kind = 'design_remix' and user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000002';

  -- A remix of a remix belongs to the original, not to its immediate parent.
  perform public.berchuma_remix(child, 'Probe remix of a remix');
  insert into probe
  select 'a third-generation remix keeps the original root',
         count(*) = 2, count(*)::text
  from public.designs where root_design_id = source;
end $$;

-- View counting, same trigger hazard.
do $$
declare
  source uuid;
  before integer;
begin
  select id, view_count into source, before
  from public.designs where slug = 'probe-public';

  perform public.berchuma_record_view(source);

  insert into probe
  select 'a view is counted on a public design',
         d.view_count = before + 1, d.view_count::text
  from public.designs d where d.id = source;
end $$;

-- A private design is not a public one, and its views are nobody's business.
do $$
declare
  target uuid;
begin
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
  select id into target from public.designs where slug = 'probe-private';
  perform public.berchuma_record_view(target);
  insert into probe
  select 'a private design does not count views', d.view_count = 0, d.view_count::text
  from public.designs d where d.id = target;
end $$;

-- Search must never surface something unpublished.
insert into probe
select 'search never returns a private design', count(*) = 0, count(*)::text
from public.search_designs('Probe private', 10);

insert into probe
select 'search finds a public design', count(*) = 1, count(*)::text
from public.search_designs('Probe public', 10);

-- ---------------------------------------------------------------------------
-- Results
-- ---------------------------------------------------------------------------

reset role;

select
  case when passed then '  PASS' else '✗ FAIL' end as result,
  name,
  case when passed then '' else detail end as detail
from probe
order by passed, name;

select
  count(*) filter (where passed) || ' passed, ' ||
  count(*) filter (where not passed) || ' failed' as summary
from probe;

-- Nothing is kept. Run it as often as you like.
rollback;
