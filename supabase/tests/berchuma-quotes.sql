-- Berchuma Studio — asking a workshop for a quote.
--
-- Run this in the Supabase SQL editor after applying 0031. It prints one line
-- per check and rolls itself back.
--
-- As always, it runs as `authenticated`. `berchuma_request_quote` is security
-- definer, which means the read policy that would normally hide a private
-- design never runs inside it — so the checks below exist to prove that the
-- function refuses on its own what the policy would have refused for it.

begin;

insert into auth.users (id, email) values
  ('cccccccc-0000-4000-8000-000000000001', 'berchuma-q-customer@example.test'),
  ('cccccccc-0000-4000-8000-000000000002', 'berchuma-q-joiner@example.test'),
  ('cccccccc-0000-4000-8000-000000000003', 'berchuma-q-stranger@example.test');

-- Two workshops and something that is not one, so the directory filter has
-- something to get wrong.
insert into public.companies (id, slug, name, category, city, owner_id, is_claimed, verified)
values
  ('dddddddd-0000-4000-8000-000000000001', 'probe-joinery', 'Probe Joinery',
   'Joinery & Furniture', 'Addis Ababa', 'cccccccc-0000-4000-8000-000000000002', true, true),
  ('dddddddd-0000-4000-8000-000000000002', 'probe-unclaimed', 'Unclaimed Woodwork',
   'Woodwork', 'Bahir Dar', null, false, false),
  ('dddddddd-0000-4000-8000-000000000003', 'probe-cement', 'Probe Cement Supply',
   'Cement & Aggregates', 'Addis Ababa', null, false, false);

create temporary table probe (name text, passed boolean, detail text);
grant all on probe to authenticated;

set local role authenticated;
set local request.jwt.claim.sub = 'cccccccc-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';

insert into public.designs (id, slug, owner_id, kind, title, spec, visibility, published_at)
values
  ('eeeeeeee-0000-4000-8000-000000000001', 'probe-quote-public',
   'cccccccc-0000-4000-8000-000000000001', 'wardrobe', 'Quotable wardrobe',
   '{"version":1}'::jsonb, 'public', now()),
  ('eeeeeeee-0000-4000-8000-000000000002', 'probe-quote-private',
   'cccccccc-0000-4000-8000-000000000001', 'wardrobe', 'Private wardrobe',
   '{"version":1}'::jsonb, 'private', null);

-- ---------------------------------------------------------------------------
-- The directory
-- ---------------------------------------------------------------------------

insert into probe
select 'the workshop list finds joineries', count(*) = 2, count(*)::text
from public.berchuma_workshops(null, 20);

insert into probe
select 'and does not offer a cement supplier', count(*) = 0, count(*)::text
from public.berchuma_workshops(null, 20) w where w.name like '%Cement%';

insert into probe
select 'a workshop in the right city comes first',
       (select name from public.berchuma_workshops('Bahir Dar', 20) limit 1)
         = 'Unclaimed Woodwork',
       coalesce((select name from public.berchuma_workshops('Bahir Dar', 20) limit 1), 'none');

-- ---------------------------------------------------------------------------
-- Sending a request
-- ---------------------------------------------------------------------------

do $$
declare
  first_id uuid;
  again_id uuid;
  r public.manufacturing_requests%rowtype;
begin
  first_id := public.berchuma_request_quote(
    'eeeeeeee-0000-4000-8000-000000000001',
    'dddddddd-0000-4000-8000-000000000001',
    '{"rows":[{"index":1,"label":"Left gable"}],"totals":{"pieces":44}}'::jsonb,
    'The wall is not square.',
    null,
    current_date + 30
  );

  select * into r from public.manufacturing_requests where id = first_id;

  insert into probe values ('a request is recorded against the requester',
    r.requester_id = 'cccccccc-0000-4000-8000-000000000001', r.requester_id::text);

  insert into probe values ('the workshop owner becomes the maker',
    r.maker_id = 'cccccccc-0000-4000-8000-000000000002', coalesce(r.maker_id::text, 'null'));

  -- The whole reason the column exists.
  insert into probe values ('the cut list is frozen into the request',
    r.cut_list -> 'totals' ->> 'pieces' = '44', coalesce(r.cut_list::text, 'null'));

  insert into probe values ('the city falls back to the workshop''s own',
    r.city = 'Addis Ababa', coalesce(r.city, 'null'));

  -- Pressing send twice.
  again_id := public.berchuma_request_quote(
    'eeeeeeee-0000-4000-8000-000000000001',
    'dddddddd-0000-4000-8000-000000000001',
    '{"totals":{"pieces":44}}'::jsonb
  );

  insert into probe values ('asking the same workshop twice returns the same request',
    again_id = first_id, coalesce(again_id::text, 'null'));

  insert into probe
  select 'and does not open a second job', count(*) = 1, count(*)::text
  from public.manufacturing_requests
  where design_id = 'eeeeeeee-0000-4000-8000-000000000001'
    and maker_company_id = 'dddddddd-0000-4000-8000-000000000001';

  -- A different workshop is a different conversation.
  perform public.berchuma_request_quote(
    'eeeeeeee-0000-4000-8000-000000000001',
    'dddddddd-0000-4000-8000-000000000002',
    '{"totals":{"pieces":44}}'::jsonb
  );

  insert into probe
  select 'a second workshop can still be asked', count(*) = 2, count(*)::text
  from public.manufacturing_requests
  where design_id = 'eeeeeeee-0000-4000-8000-000000000001';
end $$;

-- The workshop has to hear about it. Counted as the recipient, because a
-- notification is readable only by the person it is for — asking as the
-- requester returns zero and looks like nothing was sent.
set local request.jwt.claim.sub = 'cccccccc-0000-4000-8000-000000000002';

insert into probe
select 'the workshop is notified', count(*) = 1, count(*)::text
from public.notifications
where kind = 'design_order' and user_id = 'cccccccc-0000-4000-8000-000000000002';

insert into probe
select 'and the notification links to the cut list',
       count(*) = 1, coalesce(max(href), 'none')
from public.notifications
where kind = 'design_order'
  and user_id = 'cccccccc-0000-4000-8000-000000000002'
  and href = '/designs/probe-quote-public/cut-list';

-- An unclaimed workshop has nobody to tell, and that must not be an error.
insert into probe
select 'an unclaimed workshop produces no notification', count(*) = 1, count(*)::text
from public.notifications where kind = 'design_order';

-- The maker can see the request that was sent to them.
insert into probe
select 'the workshop can read the request it was sent', count(*) >= 1, count(*)::text
from public.manufacturing_requests
where maker_id = 'cccccccc-0000-4000-8000-000000000002';

-- ---------------------------------------------------------------------------
-- What a stranger cannot do
-- ---------------------------------------------------------------------------

set local request.jwt.claim.sub = 'cccccccc-0000-4000-8000-000000000003';

insert into probe
select 'a stranger cannot read somebody else''s request', count(*) = 0, count(*)::text
from public.manufacturing_requests;

do $$
begin
  -- Found by id the way an attacker would. The read policy is bypassed inside
  -- a security-definer function, so the check inside it is the only thing
  -- standing between a guessed uuid and somebody's private design.
  perform public.berchuma_request_quote(
    'eeeeeeee-0000-4000-8000-000000000002',
    'dddddddd-0000-4000-8000-000000000001',
    '{}'::jsonb
  );
  insert into probe values ('a private design cannot be sent out for quote', false, 'it succeeded');
exception when others then
  insert into probe values ('a private design cannot be sent out for quote', true, sqlerrm);
end $$;

do $$
begin
  perform public.berchuma_request_quote(
    'eeeeeeee-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000000',
    '{}'::jsonb
  );
  insert into probe values ('an unknown workshop is refused', false, 'it succeeded');
exception when others then
  insert into probe values ('an unknown workshop is refused', true, sqlerrm);
end $$;

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

rollback;
