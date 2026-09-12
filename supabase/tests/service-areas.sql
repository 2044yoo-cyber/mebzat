-- A welder based in Bole who works in Summit appears in a search for a welder
-- in Summit. That sentence is the whole feature.
--
-- Run after applying 0078. Prints one line per check and rolls itself back.
-- Run as `authenticated`: profiles and service areas both have policies.

begin;

insert into auth.users (id, email) values
  ('66600000-0000-4000-8000-000000000001', 'welder@example.test'),
  ('66600000-0000-4000-8000-000000000002', 'roamer@example.test'),
  ('66600000-0000-4000-8000-000000000003', 'homebody@example.test'),
  ('66600000-0000-4000-8000-000000000004', 'citywide@example.test'),
  ('66600000-0000-4000-8000-000000000005', 'carpenter@example.test'),
  ('66600000-0000-4000-8000-000000000006', 'firm@example.test')
on conflict (id) do nothing;

-- Everybody is based in Bole. Only what they said about *working* differs,
-- which is the point: base location must not be what decides.
update public.profiles set
  username = 'probe_welder', full_name = 'Yonas Metal Works',
  location_city = 'Addis Ababa', base_area = 'Bole', profession = 'Welder',
  years_experience = 7, work_status = 'available', account_type = 'individual'
where id = '66600000-0000-4000-8000-000000000001';

-- Deliberately the *stronger* candidate on every axis except how he covers
-- Summit: twenty years to the other's seven, same base, same availability,
-- same distance. So if listing the area stops outranking merely being within
-- radius, he overtakes — which is what check 9b measures. With them equally
-- weighted he wins by experience alone, and the first version of that check
-- passed on a mutation because the area-matcher happened to be more
-- experienced too.
update public.profiles set
  username = 'probe_roamer', full_name = 'Radius Welder',
  location_city = 'Addis Ababa', base_area = 'Bole', profession = 'Welder',
  years_experience = 20, work_status = 'available', account_type = 'individual',
  travel_radius_km = 20
where id = '66600000-0000-4000-8000-000000000002';

update public.profiles set
  username = 'probe_homebody', full_name = 'Bole Only Welder',
  location_city = 'Addis Ababa', base_area = 'Bole', profession = 'Welder',
  years_experience = 20, work_status = 'available', account_type = 'individual'
where id = '66600000-0000-4000-8000-000000000003';

update public.profiles set
  username = 'probe_citywide', full_name = 'Citywide Welding',
  location_city = 'Addis Ababa', base_area = 'Bole', profession = 'Welder',
  years_experience = 1, work_status = 'available', account_type = 'company',
  serves_entire_city = true
where id = '66600000-0000-4000-8000-000000000004';

update public.profiles set
  username = 'probe_carpenter', full_name = 'Summit Carpenter',
  location_city = 'Addis Ababa', base_area = 'Summit', profession = 'Carpenter',
  years_experience = 9, work_status = 'available', account_type = 'individual'
where id = '66600000-0000-4000-8000-000000000005';

update public.profiles set
  username = 'probe_firm', full_name = 'Big Steel PLC',
  location_city = 'Addis Ababa', base_area = 'Bole', profession = 'Welder',
  years_experience = 15, work_status = 'busy', account_type = 'company',
  license_verified = true
where id = '66600000-0000-4000-8000-000000000006';

-- The welder lists the areas he will work in. Summit is one; Bole, his base,
-- is another.
insert into public.professional_service_areas (profile_id, area_slug, area_name) values
  ('66600000-0000-4000-8000-000000000001', 'bole', 'Bole'),
  ('66600000-0000-4000-8000-000000000001', 'cmc', 'CMC'),
  ('66600000-0000-4000-8000-000000000001', 'summit', 'Summit'),
  ('66600000-0000-4000-8000-000000000001', 'ayat', 'Ayat'),
  -- Only ever works where he lives.
  ('66600000-0000-4000-8000-000000000003', 'bole', 'Bole'),
  -- The carpenter works in Summit, but is not a welder.
  ('66600000-0000-4000-8000-000000000005', 'summit', 'Summit'),
  -- The firm lists Summit but is busy.
  ('66600000-0000-4000-8000-000000000006', 'summit', 'Summit');

-- Set before dropping to `authenticated`: 0068 refuses a verification flag
-- written from a member session, which is the subject of section 12 below.
update public.profiles set phone_verified = true
where id = '66600000-0000-4000-8000-000000000001';

set role authenticated;
set local request.jwt.claim.sub = '66600000-0000-4000-8000-000000000001';

-- ===================================================================
-- 1. The sentence.
-- ===================================================================
do $$
declare found boolean; kind text;
begin
  select true, r.match_kind into found, kind
  from public.search_professionals(
    p_profession => 'Welder', p_area => 'summit'
  ) r
  where r.username = 'probe_welder';

  if not coalesce(found, false) then
    raise exception 'FAIL 1a: a welder based in Bole who lists Summit does not appear for a Summit job';
  end if;
  raise notice 'ok 1a: a welder based in Bole who works in Summit appears for a Summit job';

  if kind <> 'area' then
    raise exception 'FAIL 1b: matched as % rather than on his listed area', kind;
  end if;
  raise notice 'ok 1b: and is matched on the area he listed';
end;
$$;

-- ===================================================================
-- 2. Base location is not the filter.
-- ===================================================================
do $$
declare n integer;
begin
  select count(*) into n
  from public.search_professionals(p_profession => 'Welder', p_area => 'summit') r
  where r.username = 'probe_homebody';
  if n <> 0 then
    raise exception 'FAIL 2a: a welder who only works in Bole appears for a Summit job';
  end if;
  raise notice 'ok 2a: a welder who only lists Bole does not appear for a Summit job';

  select count(*) into n
  from public.search_professionals(p_profession => 'Welder', p_area => 'bole') r
  where r.username = 'probe_homebody';
  if n <> 1 then
    raise exception 'FAIL 2b: he does not appear for a Bole job either';
  end if;
  raise notice 'ok 2b: but does for a Bole job';

  -- Everybody in this fixture is based in Bole. If base location were still
  -- the filter, a Summit search would return nobody at all.
  select count(*) into n
  from public.search_professionals(p_profession => 'Welder', p_area => 'summit');
  if n = 0 then
    raise exception 'FAIL 2c: nobody matched a Summit job; base location is still the filter';
  end if;
  raise notice 'ok 2c: a Summit search returns welders based elsewhere (%)', n;
end;
$$;

-- ===================================================================
-- 3. The other two ways of covering an area.
-- ===================================================================
do $$
declare kind text;
begin
  select r.match_kind into kind
  from public.search_professionals(p_profession => 'Welder', p_area => 'summit') r
  where r.username = 'probe_roamer';
  if kind is distinct from 'radius' then
    raise exception 'FAIL 3a: a 20km radius from Bole did not reach Summit (got %)', kind;
  end if;
  raise notice 'ok 3a: a travel radius covers an area that was never listed';

  select r.match_kind into kind
  from public.search_professionals(p_profession => 'Welder', p_area => 'summit') r
  where r.username = 'probe_citywide';
  if kind is distinct from 'city' then
    raise exception 'FAIL 3b: serves_entire_city did not cover Summit (got %)', kind;
  end if;
  raise notice 'ok 3b: and so does covering the whole city';
end;
$$;

-- ===================================================================
-- 4. An area nobody recognises matches nobody.
--
--    The dangerous failure: an unknown place name silently dropping the
--    location filter and returning every welder in the country, which
--    reads as though they all work there.
-- ===================================================================
do $$
declare n integer;
begin
  select count(*) into n
  from public.search_professionals(p_profession => 'Welder', p_area => 'atlantis');
  if n <> 0 then
    raise exception 'FAIL 4a: an unknown area returned % professionals', n;
  end if;
  raise notice 'ok 4a: an area nobody recognises matches nobody, rather than everybody';

  select count(*) into n from public.search_professionals(p_profession => 'Welder');
  if n < 4 then
    raise exception 'FAIL 4b: no area asked for should match every welder, got %', n;
  end if;
  raise notice 'ok 4b: and asking for no area at all matches every welder (%)', n;
end;
$$;

-- ===================================================================
-- 5. The trade still filters.
-- ===================================================================
do $$
declare n integer;
begin
  select count(*) into n
  from public.search_professionals(p_profession => 'Welder', p_area => 'summit') r
  where r.username = 'probe_carpenter';
  if n <> 0 then
    raise exception 'FAIL 5a: a carpenter answered a search for a welder';
  end if;
  raise notice 'ok 5a: a carpenter in Summit is not a welder in Summit';

  select count(*) into n
  from public.search_professionals(p_profession => 'Carpenter', p_area => 'summit') r
  where r.username = 'probe_carpenter';
  if n <> 1 then
    raise exception 'FAIL 5b: the carpenter does not answer a search for a carpenter';
  end if;
  raise notice 'ok 5b: and does answer a search for a carpenter';
end;
$$;

-- ===================================================================
-- 6. Individual and company.
-- ===================================================================
do $$
declare n integer;
begin
  select count(*) into n
  from public.search_professionals(p_area => 'summit', p_provider => 'individual') r
  where r.account_type <> 'individual';
  if n <> 0 then
    raise exception 'FAIL 6a: a company answered an individuals-only search';
  end if;
  raise notice 'ok 6a: individuals-only returns no companies';

  select count(*) into n
  from public.search_professionals(p_area => 'summit', p_provider => 'company') r
  where r.account_type = 'individual';
  if n <> 0 then
    raise exception 'FAIL 6b: an individual answered a companies-only search';
  end if;
  raise notice 'ok 6b: and companies-only returns no individuals';
end;
$$;

-- ===================================================================
-- 7. Verified means a document, not a phone number.
-- ===================================================================
do $$
declare n integer;
begin
  select count(*) into n
  from public.search_professionals(p_area => 'summit', p_verified_only => true) r
  where r.username = 'probe_welder';
  if n <> 0 then
    raise exception 'FAIL 7a: a phone-verified account passed a verified-only filter';
  end if;
  raise notice 'ok 7a: a confirmed phone number is not a verification';

  select count(*) into n
  from public.search_professionals(p_area => 'summit', p_verified_only => true) r
  where r.username = 'probe_firm';
  if n <> 1 then
    raise exception 'FAIL 7b: a licence-verified firm failed a verified-only filter';
  end if;
  raise notice 'ok 7b: a checked licence is';
end;
$$;

-- ===================================================================
-- 8. Availability.
-- ===================================================================
do $$
declare n integer;
begin
  select count(*) into n
  from public.search_professionals(p_area => 'summit', p_available_only => true) r
  where r.username = 'probe_firm';
  if n <> 0 then
    raise exception 'FAIL 8a: a busy firm answered an available-now search';
  end if;
  raise notice 'ok 8a: available-now excludes somebody who said they are busy';
end;
$$;

-- ===================================================================
-- 9. Ranking is not distance.
--
--    probe_homebody is 20 years in and sits in Bole; the search is for
--    Summit. He must not be first merely for being near, and in fact must
--    not appear at all. Of those who do, the one who listed the area
--    outranks the one merely passing within radius.
-- ===================================================================
do $$
declare first_row text; area_pos integer; radius_pos integer;
begin
  select r.username into first_row
  from public.search_professionals(p_profession => 'Welder', p_area => 'summit') r
  limit 1;
  raise notice 'ok 9a: first result for a Summit welder is %', first_row;

  select pos into area_pos from (
    select row_number() over () as pos, r.username
    from public.search_professionals(p_profession => 'Welder', p_area => 'summit') r
  ) t where t.username = 'probe_welder';

  select pos into radius_pos from (
    select row_number() over () as pos, r.username
    from public.search_professionals(p_profession => 'Welder', p_area => 'summit') r
  ) t where t.username = 'probe_roamer';

  if area_pos >= radius_pos then
    raise exception 'FAIL 9b: the one who listed Summit (%) ranked below the one within radius (%)',
      area_pos, radius_pos;
  end if;
  raise notice 'ok 9b: listing the area outranks merely being within radius';
end;
$$;

-- ===================================================================
-- 10. A professional cannot claim somebody else's areas.
-- ===================================================================
do $$
declare n integer;
begin
  begin
    insert into public.professional_service_areas (profile_id, area_slug, area_name)
    values ('66600000-0000-4000-8000-000000000003', 'gerji', 'Gerji');
    raise exception 'FAIL 10a: wrote a service area onto somebody else''s profile';
  exception
    when insufficient_privilege then
      raise notice 'ok 10a: a professional cannot add areas to somebody else''s profile';
  end;

  select count(*) into n from public.professional_service_areas
  where profile_id = '66600000-0000-4000-8000-000000000001';
  if n <> 4 then
    raise exception 'FAIL 10b: expected 4 own areas, found %', n;
  end if;
  raise notice 'ok 10b: and can read and keep their own';
end;
$$;

-- ===================================================================
-- 11. The gazetteer is public.
-- ===================================================================
do $$
declare n integer;
begin
  select count(*) into n from public.location_areas where slug in ('bole','summit','cmc','ayat','gerji');
  if n <> 5 then
    raise exception 'FAIL 11a: only % of the 5 areas in the brief exist', n;
  end if;
  raise notice 'ok 11a: every area the brief names is in the gazetteer';
end;
$$;

-- ===================================================================
-- 12. Nobody grants themselves a badge.
--
--     These three outrank a phone number by design, so a member being able
--     to set them from the browser would make the whole scale meaningless.
--     0068 guarded phone_verified and verification_status; 0078 adds the
--     three columns it explicitly said did not exist yet, so its guard has
--     to grow with them.
-- ===================================================================
do $$
begin
  begin
    update public.profiles set license_verified = true
    where id = '66600000-0000-4000-8000-000000000001';
    raise exception 'FAIL 12a: a member granted themselves a professional licence badge';
  exception
    when raise_exception then
      if sqlerrm like 'FAIL%' then raise; end if;
      raise notice 'ok 12a: a member cannot grant themselves a licence badge';
  end;

  begin
    update public.profiles set id_verified = true
    where id = '66600000-0000-4000-8000-000000000001';
    raise exception 'FAIL 12b: a member granted themselves an ID badge';
  exception
    when raise_exception then
      if sqlerrm like 'FAIL%' then raise; end if;
      raise notice 'ok 12b: nor an ID badge';
  end;

  begin
    update public.profiles set business_verified = true
    where id = '66600000-0000-4000-8000-000000000001';
    raise exception 'FAIL 12c: a member granted themselves a business badge';
  exception
    when raise_exception then
      if sqlerrm like 'FAIL%' then raise; end if;
      raise notice 'ok 12c: nor a business badge';
  end;

  -- And can still edit the things that are theirs to say.
  update public.profiles set base_area = 'Gerji', travel_radius_km = 10
  where id = '66600000-0000-4000-8000-000000000001';
  raise notice 'ok 12d: but can still set their own base area and travel radius';
end;
$$;

-- ===================================================================
-- 13. The bounds on what a profile can claim.
-- ===================================================================
do $$
declare i integer;
begin
  begin
    update public.profiles set travel_radius_km = 7
    where id = '66600000-0000-4000-8000-000000000001';
    raise exception 'FAIL 13a: accepted a travel radius that is not one of the offered choices';
  exception
    when check_violation then
      raise notice 'ok 13a: a travel radius must be one of the offered choices';
  end;

  begin
    update public.profiles
    set specialties = (select array_agg('spec' || g) from generate_series(1, 20) g)
    where id = '66600000-0000-4000-8000-000000000001';
    raise exception 'FAIL 13b: accepted twenty specialties';
  exception
    when check_violation then
      raise notice 'ok 13b: and a handful of specialties, not twenty';
  end;

  begin
    update public.profiles set specialties = array['gates', '']
    where id = '66600000-0000-4000-8000-000000000001';
    raise exception 'FAIL 13c: accepted a blank specialty';
  exception
    when check_violation then raise notice 'ok 13c: and none of them blank';
  end;

  -- A row per area with nothing stopping it is a way to claim the whole city
  -- one insert at a time and sit at the top of every search.
  begin
    for i in 1..60 loop
      insert into public.professional_service_areas (profile_id, area_slug, area_name)
      values ('66600000-0000-4000-8000-000000000001', 'filler-' || i, 'Filler ' || i);
    end loop;
    raise exception 'FAIL 13d: one professional claimed 60 service areas';
  exception
    when check_violation then
      raise notice 'ok 13d: a professional cannot claim an unbounded number of areas';
  end;
end;
$$;

rollback;
