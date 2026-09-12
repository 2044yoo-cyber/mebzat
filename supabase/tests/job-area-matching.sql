-- A job posted for Summit reaches the people who work in Summit.
--
-- Run after applying 0079. Prints one line per check and rolls itself back.
-- Run as `authenticated`: project_briefs and profiles both have policies, and
-- match_professionals is security definer, which is exactly the kind of
-- function a superuser run would report as working when it is not.

begin;

insert into auth.users (id, email) values
  ('77700000-0000-4000-8000-000000000007', 'banned@example.test'),
  ('77700000-0000-4000-8000-000000000008', 'filler@example.test'),
  ('77700000-0000-4000-8000-000000000001', 'client@example.test'),
  ('77700000-0000-4000-8000-000000000002', 'summitwelder@example.test'),
  ('77700000-0000-4000-8000-000000000003', 'bolewelder@example.test'),
  ('77700000-0000-4000-8000-000000000004', 'roamer@example.test'),
  ('77700000-0000-4000-8000-000000000005', 'carpenter@example.test'),
  ('77700000-0000-4000-8000-000000000006', 'nolisting@example.test')
on conflict (id) do nothing;

-- The client is also a welder who works in Summit. Without that, "nobody is
-- offered their own job" passed because the client had no trade and was
-- filtered out one line earlier for a different reason entirely.
update public.profiles set
  username = 'probe_client', full_name = 'A Client Who Welds',
  location_city = 'Addis Ababa', base_area = 'Bole', profession = 'Welder',
  work_status = 'available'
where id = '77700000-0000-4000-8000-000000000001';

-- Every welder here is based in Bole. Only what they said about *working*
-- differs, and that is what must decide who is told about the job.
update public.profiles set
  username = 'probe_summitwelder', full_name = 'Works In Summit',
  location_city = 'Addis Ababa', base_area = 'Bole', profession = 'Welder',
  work_status = 'available', years_experience = 7
where id = '77700000-0000-4000-8000-000000000002';

update public.profiles set
  username = 'probe_bolewelder', full_name = 'Bole Only',
  location_city = 'Addis Ababa', base_area = 'Bole', profession = 'Welder',
  work_status = 'available', years_experience = 20
where id = '77700000-0000-4000-8000-000000000003';

update public.profiles set
  username = 'probe_roamer', full_name = 'Travels Far',
  location_city = 'Addis Ababa', base_area = 'Bole', profession = 'Welder',
  work_status = 'available', travel_radius_km = 20
where id = '77700000-0000-4000-8000-000000000004';

update public.profiles set
  username = 'probe_carpenter', full_name = 'Summit Carpenter',
  location_city = 'Addis Ababa', base_area = 'Summit', profession = 'Carpenter',
  work_status = 'available'
where id = '77700000-0000-4000-8000-000000000005';

-- No service listing at all, and a trade and an area. Before 0079 this person
-- could not be matched to anything.
update public.profiles set
  username = 'probe_nolisting', full_name = 'No Listing Welder',
  location_city = 'Addis Ababa', base_area = 'Gerji', profession = 'Welder',
  work_status = 'available'
where id = '77700000-0000-4000-8000-000000000006';

-- A welder who works in Summit and whom a moderator has restricted. Telling
-- somebody about a job is recommending them; a restricted account must not be.
update public.profiles set
  username = 'probe_banned', full_name = 'Restricted Welder',
  location_city = 'Addis Ababa', base_area = 'Bole', profession = 'Welder',
  work_status = 'available', restricted_until = now() + interval '30 days'
where id = '77700000-0000-4000-8000-000000000007';

-- Built to score 0.27: a partial trade match through a service title, a price
-- far above the budget, not accepting work, nothing behind them. Above the
-- floor it is filler; the floor is what keeps it out.
update public.profiles set
  username = 'probe_filler', full_name = 'Barely Related',
  location_city = 'Addis Ababa', base_area = 'Bole', profession = 'Plumber',
  work_status = 'offline'
where id = '77700000-0000-4000-8000-000000000008';

insert into public.services (provider_id, title, slug, category_id, price_from, status, accepting_work)
select '77700000-0000-4000-8000-000000000008', 'Odd joinery jobs', 'odd-joinery-probe',
       sc.id, 50000, 'published', true
from public.service_categories sc where sc.slug = 'plumbing';

insert into public.professional_service_areas (profile_id, area_slug, area_name) values
  -- The client covers Summit too, so the only thing that can keep them out of
  -- their own job's matches is the rule that says so. Without this row the
  -- coverage gate excluded them first and the check passed for free.
  ('77700000-0000-4000-8000-000000000001', 'summit', 'Summit'),
  ('77700000-0000-4000-8000-000000000007', 'summit', 'Summit'),
  ('77700000-0000-4000-8000-000000000002', 'summit', 'Summit'),
  ('77700000-0000-4000-8000-000000000002', 'bole', 'Bole'),
  ('77700000-0000-4000-8000-000000000003', 'bole', 'Bole'),
  ('77700000-0000-4000-8000-000000000005', 'summit', 'Summit'),
  ('77700000-0000-4000-8000-000000000006', 'summit', 'Summit');

set role authenticated;
set local request.jwt.claim.sub = '77700000-0000-4000-8000-000000000001';

insert into public.project_briefs (
  id, client_id, title, slug, description, category, profession,
  location_city, location_area, status
) values (
  '88800000-0000-4000-8000-000000000001',
  '77700000-0000-4000-8000-000000000001',
  'Six metre entrance gate', 'six-metre-gate-probe',
  'I need a welder to fabricate a 6-meter entrance gate in Summit.',
  'joinery', 'Welder', 'Addis Ababa', 'summit', 'open'
);

-- ===================================================================
-- 1. The sentence.
-- ===================================================================
do $$
declare n integer;
begin
  select count(*) into n
  from public.match_professionals('88800000-0000-4000-8000-000000000001', 50) m
  where m.provider_id = '77700000-0000-4000-8000-000000000002';
  if n <> 1 then
    raise exception 'FAIL 1a: the welder who works in Summit was not matched to a Summit job';
  end if;
  raise notice 'ok 1a: a welder based in Bole who works in Summit is matched to a Summit job';

  select count(*) into n
  from public.match_professionals('88800000-0000-4000-8000-000000000001', 50) m
  where m.provider_id = '77700000-0000-4000-8000-000000000003';
  if n <> 0 then
    raise exception 'FAIL 1b: a welder who only works in Bole was told about a Summit job';
  end if;
  raise notice 'ok 1b: and one who only works in Bole is not';
end;
$$;

-- ===================================================================
-- 2. Somebody with a trade and no service listing is reachable.
--
--    The matcher used to start from `services`, so a professional who
--    filled in the Professionals form and never wrote a service listing
--    could not be matched to anything at all.
-- ===================================================================
do $$
declare n integer;
begin
  select count(*) into n
  from public.match_professionals('88800000-0000-4000-8000-000000000001', 50) m
  where m.provider_id = '77700000-0000-4000-8000-000000000006';
  if n <> 1 then
    raise exception 'FAIL 2a: a welder with no service listing was not matched';
  end if;
  raise notice 'ok 2a: a trade and a service area is enough to be matched';
end;
$$;

-- ===================================================================
-- 3. A travel radius reaches, and the wrong trade does not.
-- ===================================================================
do $$
declare n integer;
begin
  select count(*) into n
  from public.match_professionals('88800000-0000-4000-8000-000000000001', 50) m
  where m.provider_id = '77700000-0000-4000-8000-000000000004';
  if n <> 1 then
    raise exception 'FAIL 3a: a 20km radius from Bole did not reach Summit';
  end if;
  raise notice 'ok 3a: a travel radius reaches an area that was never listed';

  select count(*) into n
  from public.match_professionals('88800000-0000-4000-8000-000000000001', 50) m
  where m.provider_id = '77700000-0000-4000-8000-000000000005';
  if n <> 0 then
    raise exception 'FAIL 3b: a carpenter was told about a job for a welder';
  end if;
  raise notice 'ok 3b: a carpenter in Summit is not sent a welding job';

  select count(*) into n
  from public.match_professionals('88800000-0000-4000-8000-000000000001', 50) m
  where m.provider_id = '77700000-0000-4000-8000-000000000001';
  if n <> 0 then
    raise exception 'FAIL 3c: the client was matched to their own job';
  end if;
  raise notice 'ok 3c: and nobody is offered their own job, even when they do the work';

  select count(*) into n
  from public.match_professionals('88800000-0000-4000-8000-000000000001', 50) m
  where m.provider_id = '77700000-0000-4000-8000-000000000007';
  if n <> 0 then
    raise exception 'FAIL 3d: a restricted account was recommended for a job';
  end if;
  raise notice 'ok 3d: nor is an account a moderator has restricted';
end;
$$;

-- ===================================================================
-- 4. Listing the area outranks being caught by a radius.
-- ===================================================================
do $$
declare listed real; roaming real;
begin
  select m.score into listed
  from public.match_professionals('88800000-0000-4000-8000-000000000001', 50) m
  where m.provider_id = '77700000-0000-4000-8000-000000000002';

  select m.score into roaming
  from public.match_professionals('88800000-0000-4000-8000-000000000001', 50) m
  where m.provider_id = '77700000-0000-4000-8000-000000000004';

  if listed <= roaming then
    raise exception 'FAIL 4a: listing the area (%) did not outrank a radius (%)', listed, roaming;
  end if;
  raise notice 'ok 4a: saying you work there outranks being caught by a radius';
end;
$$;

do $$
declare why text;
begin
  select m.reason into why
  from public.match_professionals('88800000-0000-4000-8000-000000000001', 50) m
  where m.provider_id = '77700000-0000-4000-8000-000000000002';
  if why <> 'Works in the area you named' then
    raise exception 'FAIL 4b: the reason given was "%"', why;
  end if;
  raise notice 'ok 4b: and the client is told that is why';
end;
$$;

-- ===================================================================
-- 5. A brief written before this column existed still matches.
--
--    Every brief on the platform today has a null location_area. If that
--    read as "covers nowhere", posting a job would stop working for
--    everyone the moment this migration landed.
-- ===================================================================
insert into public.project_briefs (
  id, client_id, title, slug, description, category, profession,
  location_city, status
) values (
  '88800000-0000-4000-8000-000000000002',
  '77700000-0000-4000-8000-000000000001',
  'An older brief', 'older-brief-probe',
  'Written before anybody could say which area.',
  'joinery', 'Welder', 'Addis Ababa', 'open'
);

do $$
declare n integer;
begin
  select count(*) into n
  from public.match_professionals('88800000-0000-4000-8000-000000000002', 50);
  if n < 3 then
    raise exception 'FAIL 5a: a brief with no area matched only % professionals', n;
  end if;
  raise notice 'ok 5a: a brief with no stated area still matches every welder (%)', n;
end;
$$;

-- ===================================================================
-- 5b. Filler is not a match.
--
--     probe_filler clears the trade and coverage gates and scores 0.27,
--     which 0015 called filler and excluded. Without the floor a client
--     gets a page of people who are barely related to the work.
-- ===================================================================
insert into public.project_briefs (
  id, client_id, title, slug, description, category,
  location_city, budget_max, status
) values (
  '88800000-0000-4000-8000-000000000003',
  '77700000-0000-4000-8000-000000000001',
  'A small joinery job', 'small-joinery-probe',
  'Nothing much.', 'joinery', 'Addis Ababa', 1000, 'open'
);

do $$
declare n integer;
begin
  select count(*) into n
  from public.match_professionals('88800000-0000-4000-8000-000000000003', 50) m
  where m.provider_id = '77700000-0000-4000-8000-000000000008';
  if n <> 0 then
    raise exception 'FAIL 5b: a barely-related professional was offered as a match';
  end if;
  raise notice 'ok 5b: barely related is not a match';
end;
$$;

-- ===================================================================
-- 6. Inviting goes to the matched, once each.
-- ===================================================================
do $$
declare sent integer; n integer;
begin
  sent := public.invite_matching_professionals('88800000-0000-4000-8000-000000000001', 20);
  if sent < 3 then
    raise exception 'FAIL 6a: only % invites went out', sent;
  end if;
  raise notice 'ok 6a: the matched professionals are invited (%)', sent;

  select count(*) into n from public.brief_invites
  where brief_id = '88800000-0000-4000-8000-000000000001'
    and professional_id = '77700000-0000-4000-8000-000000000003';
  if n <> 0 then
    raise exception 'FAIL 6b: the Bole-only welder was invited to a Summit job';
  end if;
  raise notice 'ok 6b: and the one who does not work there is not';

  -- Re-publishing must not notify the same people twice.
  sent := public.invite_matching_professionals('88800000-0000-4000-8000-000000000001', 20);
  if sent <> 0 then
    raise exception 'FAIL 6c: a second call sent % more invites', sent;
  end if;
  raise notice 'ok 6c: calling it again tells nobody twice';
end;
$$;

rollback;
