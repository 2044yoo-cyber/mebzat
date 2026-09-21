-- Saving a profile, with the payload the form actually posts.
--
-- Run after applying 0100. Prints one line per check and rolls itself back.
-- Run as `authenticated` with a real `sub`, because a profile is written by
-- its owner and the policy is part of what has to work.
--
-- The failure this exists for: "Could not find the 'company_size' column of
-- 'profiles' in the schema cache". PostgREST said that because the column was
-- not there — 0086 had not been applied — and the form had no way to tell
-- anybody which of its two dozen columns was the missing one. So this writes
-- every column the form writes, in one statement, exactly as the form does.
-- A column missing from any of them fails here rather than in somebody's
-- browser.

begin;

-- Both accounts created before the role drops. `authenticated` cannot write
-- auth.users, and a fixture inserted half way down fails on a permission
-- error that reads nothing like the thing being tested.
insert into auth.users (id, email) values
  ('81000000-0000-4000-8000-000000000001', 'saver@example.test'),
  ('81000000-0000-4000-8000-000000000002', 'stranger@example.test')
on conflict (id) do nothing;

set role authenticated;
set local request.jwt.claim.sub = '81000000-0000-4000-8000-000000000001';

-- ===================================================================
-- 1. The whole form, in one update.
-- ===================================================================
do $$
begin
  update public.profiles set
    -- The organisation block. `company_size` is the one that failed.
    account_type = 'company',
    company_name = 'Probe Build PLC',
    industry = 'General contracting',
    company_size = '6–20 people',
    website = 'https://probe.test',
    portfolio_link = 'https://behance.test/probe',
    linkedin_url = 'https://linkedin.test/probe',
    -- The person block.
    full_name = 'Probe Saver',
    username = 'probe_saver',
    bio = 'Fifteen years of fit-out work in Addis Ababa.',
    phone = '+251900000099',
    show_phone = true,
    show_email = false,
    years_experience = 15,
    languages = array['Amharic', 'English'],
    location_city = 'Addis Ababa',
    location_country = 'Ethiopia',
    -- The trade block.
    profession = 'Contractor',
    profession_details = '{"crew_size": 12, "sectors": ["Residential"]}'::jsonb,
    specialties = array['Fit-out', 'Finishing'],
    base_area = 'Bole',
    travel_radius_km = 20,
    serves_entire_city = false,
    work_status = 'available'
  where id = '81000000-0000-4000-8000-000000000001';

  if not found then
    raise exception 'FAIL 1a: the owner could not write their own profile';
  end if;
  raise notice 'ok 1a: every column the form posts accepts a write';
end;
$$;

-- ===================================================================
-- 2. And it is still there afterwards.
-- ===================================================================
do $$
declare row record;
begin
  select company_size, industry, bio, languages, profession_details, specialties
    into row
  from public.profiles
  where id = '81000000-0000-4000-8000-000000000001';

  if row.company_size is distinct from '6–20 people' then
    raise exception 'FAIL 2a: company_size did not persist (got %)', row.company_size;
  end if;
  raise notice 'ok 2a: the company size persists';

  if row.industry is distinct from 'General contracting' then
    raise exception 'FAIL 2b: industry did not persist';
  end if;
  raise notice 'ok 2b: and the industry beside it';

  if row.bio is distinct from 'Fifteen years of fit-out work in Addis Ababa.' then
    raise exception 'FAIL 2c: the bio did not persist';
  end if;
  raise notice 'ok 2c: the bio persists';

  -- Written as an array rather than a comma-joined string, which is the
  -- difference between two languages and one language with a comma in it.
  if array_length(row.languages, 1) is distinct from 2 then
    raise exception 'FAIL 2d: languages did not persist as two entries';
  end if;
  raise notice 'ok 2d: two languages persist as two';

  if row.profession_details ->> 'crew_size' is distinct from '12' then
    raise exception 'FAIL 2e: the trade answers did not persist';
  end if;
  raise notice 'ok 2e: and the trade''s own answers';

  if array_length(row.specialties, 1) is distinct from 2 then
    raise exception 'FAIL 2f: specialties did not persist';
  end if;
  raise notice 'ok 2f: and the specialties';
end;
$$;

-- ===================================================================
-- 3. Nobody else may write it.
-- ===================================================================
set local request.jwt.claim.sub = '81000000-0000-4000-8000-000000000002';

do $$
begin
  update public.profiles set company_size = 'Hijacked'
  where id = '81000000-0000-4000-8000-000000000001';
  if found then
    raise exception 'FAIL 3a: a stranger rewrote somebody else''s profile';
  end if;
  raise notice 'ok 3a: and only its owner can write it';
end;
$$;

reset role;
rollback;
