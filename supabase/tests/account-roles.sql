-- A homeowner is not a carpenter, and an agent's record is their own.
--
-- Run after applying 0099. Prints one line per check and rolls itself back.
-- Sections 1 and 2 run as `authenticated` with a real `sub`, because that is
-- the only role the policies name; section 3 runs as `anon`, because somebody
-- looking for a welder does not need an account and the search must still
-- refuse to offer them a homeowner.

begin;

insert into auth.users (id, email) values
  ('70000000-0000-4000-8000-000000000001', 'pro@example.test'),
  ('70000000-0000-4000-8000-000000000002', 'client@example.test'),
  ('70000000-0000-4000-8000-000000000003', 'agent@example.test'),
  ('70000000-0000-4000-8000-000000000004', 'seller@example.test'),
  ('70000000-0000-4000-8000-000000000005', 'firm@example.test'),
  ('70000000-0000-4000-8000-000000000006', 'unanswered@example.test'),
  ('70000000-0000-4000-8000-000000000007', 'stranger@example.test')
on conflict (id) do nothing;

-- Every fixture is the same welder in the same place with the same experience.
-- The *only* difference between them is the role, so anything that separates
-- them in section 3 can only be the role.
update public.profiles set
  username = 'probe_role_pro', full_name = 'Role Pro',
  location_city = 'Addis Ababa', base_area = 'Bole', profession = 'Welder',
  years_experience = 5, work_status = 'available', account_type = 'individual',
  roles = array['professional']::public.medosha_role[],
  primary_role = 'professional'
where id = '70000000-0000-4000-8000-000000000001';

-- Signed up to hire somebody. Has a trade filled in as well, which is the
-- hard case: if the search fell back to "has a profession" the role would
-- never be consulted and this check would pass for the wrong reason.
update public.profiles set
  username = 'probe_role_client', full_name = 'Role Client',
  location_city = 'Addis Ababa', base_area = 'Bole', profession = 'Welder',
  years_experience = 5, work_status = 'available', account_type = 'individual',
  roles = array['client']::public.medosha_role[],
  primary_role = 'client'
where id = '70000000-0000-4000-8000-000000000002';

update public.profiles set
  username = 'probe_role_agent', full_name = 'Role Agent',
  location_city = 'Addis Ababa', base_area = 'Bole', profession = 'Welder',
  years_experience = 5, work_status = 'available', account_type = 'individual',
  roles = array['agent']::public.medosha_role[],
  primary_role = 'agent'
where id = '70000000-0000-4000-8000-000000000003';

update public.profiles set
  username = 'probe_role_seller', full_name = 'Role Seller',
  location_city = 'Addis Ababa', base_area = 'Bole', profession = 'Welder',
  years_experience = 5, work_status = 'available', account_type = 'supplier',
  roles = array['seller']::public.medosha_role[],
  primary_role = 'seller'
where id = '70000000-0000-4000-8000-000000000004';

update public.profiles set
  username = 'probe_role_firm', full_name = 'Role Firm PLC',
  location_city = 'Addis Ababa', base_area = 'Bole', profession = 'Welder',
  years_experience = 5, work_status = 'available', account_type = 'company',
  roles = array['company']::public.medosha_role[],
  primary_role = 'company'
where id = '70000000-0000-4000-8000-000000000005';

-- Signed up a minute ago and has not answered the welcome question. Must not
-- vanish from a search on account of a question nobody has asked yet.
update public.profiles set
  username = 'probe_role_unanswered', full_name = 'Role Unanswered',
  location_city = 'Addis Ababa', base_area = 'Bole', profession = 'Welder',
  years_experience = 5, work_status = 'available', account_type = 'individual',
  roles = '{}'::public.medosha_role[],
  primary_role = null
where id = '70000000-0000-4000-8000-000000000006';

update public.profiles set
  username = 'probe_role_stranger', full_name = 'Role Stranger'
where id = '70000000-0000-4000-8000-000000000007';

insert into public.professional_service_areas (profile_id, area_slug, area_name) values
  ('70000000-0000-4000-8000-000000000001', 'bole', 'Bole'),
  ('70000000-0000-4000-8000-000000000002', 'bole', 'Bole'),
  ('70000000-0000-4000-8000-000000000003', 'bole', 'Bole'),
  ('70000000-0000-4000-8000-000000000004', 'bole', 'Bole'),
  ('70000000-0000-4000-8000-000000000005', 'bole', 'Bole'),
  ('70000000-0000-4000-8000-000000000006', 'bole', 'Bole');

-- ===================================================================
-- 1. The agent's record belongs to the agent.
-- ===================================================================
set role authenticated;
set local request.jwt.claim.sub = '70000000-0000-4000-8000-000000000003';

do $$
begin
  insert into public.agent_profiles (profile_id, agency_name, license_number)
  values ('70000000-0000-4000-8000-000000000003', 'Probe Properties', 'RE-1');
  raise notice 'ok 1a: an agent can create their own record';
end;
$$;

do $$
declare n integer;
begin
  insert into public.agent_service_areas (profile_id, area_slug, area_name)
  values ('70000000-0000-4000-8000-000000000003', 'ayat', 'Ayat');

  select count(*) into n from public.agent_service_areas
  where profile_id = '70000000-0000-4000-8000-000000000003';
  if n <> 1 then
    raise exception 'FAIL 1b: an agent cannot record the areas they cover';
  end if;
  raise notice 'ok 1b: and record the areas they cover';
end;
$$;

do $$
begin
  begin
    insert into public.agent_profiles (profile_id, agency_name)
    values ('70000000-0000-4000-8000-000000000007', 'Not Mine');
    raise exception 'FAIL 1c: an agent record can be created for somebody else';
  exception
    when insufficient_privilege then
      raise notice 'ok 1c: and for nobody else';
  end;
end;
$$;

-- ===================================================================
-- 2. Somebody else's record is read-only, and the shop's is the same.
-- ===================================================================
set local request.jwt.claim.sub = '70000000-0000-4000-8000-000000000007';

do $$
declare n integer;
begin
  -- Public to read: an agent exists to be found.
  select count(*) into n from public.agent_profiles
  where profile_id = '70000000-0000-4000-8000-000000000003';
  if n <> 1 then
    raise exception 'FAIL 2a: an agent profile cannot be read by anybody else';
  end if;
  raise notice 'ok 2a: an agent profile is public to read';

  update public.agent_profiles set agency_name = 'Hijacked'
  where profile_id = '70000000-0000-4000-8000-000000000003';
  if found then
    raise exception 'FAIL 2b: a stranger rewrote an agent''s agency';
  end if;
  raise notice 'ok 2b: and only the agent can change it';

  delete from public.agent_service_areas
  where profile_id = '70000000-0000-4000-8000-000000000003';
  if found then
    raise exception 'FAIL 2c: a stranger deleted the areas an agent covers';
  end if;
  raise notice 'ok 2c: and only the agent can clear the areas they cover';
end;
$$;

set local request.jwt.claim.sub = '70000000-0000-4000-8000-000000000004';

do $$
declare n integer;
begin
  insert into public.seller_profiles (profile_id, store_name, category_slugs, delivers)
  values ('70000000-0000-4000-8000-000000000004', 'Probe Hardware',
          array['cement', 'steel'], true);
  raise notice 'ok 2d: a shop can create its own record';

  -- The upsert the save action performs, exercised as the policy sees it:
  -- an update by the owner, not an insert by one.
  update public.seller_profiles set store_name = 'Probe Hardware PLC'
  where profile_id = '70000000-0000-4000-8000-000000000004';
  select count(*) into n from public.seller_profiles
  where profile_id = '70000000-0000-4000-8000-000000000004'
    and store_name = 'Probe Hardware PLC';
  if n <> 1 then
    raise exception 'FAIL 2e: a shop cannot change its own name';
  end if;
  raise notice 'ok 2e: and change it afterwards';
end;
$$;

-- ===================================================================
-- 3. A search for somebody to hire returns somebody offering to work.
-- ===================================================================
reset role;
set role anon;

do $$
declare n integer;
begin
  select count(*) into n
  from public.search_professionals(p_profession => 'Welder', p_area => 'bole') r
  where r.username = 'probe_role_client';
  if n <> 0 then
    raise exception 'FAIL 3a: a homeowner is offered as a welder';
  end if;
  raise notice 'ok 3a: a homeowner is not offered as a welder';

  select count(*) into n
  from public.search_professionals(p_profession => 'Welder', p_area => 'bole') r
  where r.username = 'probe_role_pro';
  if n <> 1 then
    raise exception 'FAIL 3b: a professional no longer appears at all';
  end if;
  raise notice 'ok 3b: a professional still appears';

  select count(*) into n
  from public.search_professionals(p_profession => 'Welder', p_area => 'bole') r
  where r.username = 'probe_role_firm';
  if n <> 1 then
    raise exception 'FAIL 3c: a firm no longer appears';
  end if;
  raise notice 'ok 3c: and so does a firm';

  select count(*) into n
  from public.search_professionals(p_profession => 'Welder', p_area => 'bole') r
  where r.username in ('probe_role_agent', 'probe_role_seller');
  if n <> 0 then
    raise exception 'FAIL 3d: an agent or a supplier is offered as a welder';
  end if;
  raise notice 'ok 3d: an agent and a supplier are found in their own places, not this one';

  select count(*) into n
  from public.search_professionals(p_profession => 'Welder', p_area => 'bole') r
  where r.username = 'probe_role_unanswered';
  if n <> 1 then
    raise exception 'FAIL 3e: an account that has not answered the welcome question disappeared';
  end if;
  raise notice 'ok 3e: an account mid-question is not thrown out of the search';

  -- The fixtures are identical apart from the role, so this is the whole
  -- filter stated as one number: six welders in Bole, two of them offering
  -- to work and one who has not been asked.
  select count(*) into n
  from public.search_professionals(p_profession => 'Welder', p_area => 'bole') r
  where r.username like 'probe_role_%';
  if n <> 3 then
    raise exception 'FAIL 3f: % of the six identical welders matched, not three', n;
  end if;
  raise notice 'ok 3f: three of six identical welders match, and the role is the only difference';
end;
$$;

reset role;
rollback;
