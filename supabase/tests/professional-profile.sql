-- Contact details are shown by choice, and the rating adds up.
--
-- Run after applying 0071. Prints one line per check and rolls itself back.
--
-- Run as `authenticated`, not as the SQL editor's superuser: the aggregate is
-- `security definer` and the tables under it have policies, so a superuser run
-- would report that everything works while proving nothing about what a
-- visitor actually sees.

begin;

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000001', 'pro@example.test'),
  ('a0000000-0000-4000-8000-000000000002', 'client_one@example.test'),
  ('a0000000-0000-4000-8000-000000000003', 'client_two@example.test'),
  ('a0000000-0000-4000-8000-000000000005', 'client_three@example.test')
on conflict (id) do nothing;

-- Upserted, not `do nothing`. Inserting into auth.users fires the trigger that
-- creates the profile, so `do nothing` would leave `phone` null on the very
-- profile whose phone this file is about.
insert into public.profiles (id, username, full_name, phone, email) values
  ('a0000000-0000-4000-8000-000000000001', 'pro_probe', 'Pro Probe', '+251900000021', 'pro@example.test'),
  ('a0000000-0000-4000-8000-000000000002', 'client_one', 'Client One', '+251900000022', 'client_one@example.test'),
  ('a0000000-0000-4000-8000-000000000003', 'client_two', 'Client Two', '+251900000023', 'client_two@example.test'),
  ('a0000000-0000-4000-8000-000000000005', 'client_three', 'Client Three', '+251900000025', 'client_three@example.test')
on conflict (id) do update set
  username = excluded.username,
  full_name = excluded.full_name,
  phone = excluded.phone,
  email = excluded.email;

-- ===================================================================
-- 1. A phone number is private until its owner says otherwise.
-- ===================================================================
do $$
declare row public.profiles;
begin
  select * into row from public.profiles
  where id = 'a0000000-0000-4000-8000-000000000001';

  if row.show_phone then
    raise exception 'FAIL 1a: an existing profile with a phone number defaults to showing it';
  end if;
  raise notice 'ok 1a: a profile that already had a number does not publish it';

  if row.show_email then
    raise exception 'FAIL 1b: the email address defaults to public';
  end if;
  raise notice 'ok 1b: nor the email address';

  if row.phone is null then
    raise exception 'FAIL 1c: the fixture has no phone number, so 1a proves nothing';
  end if;
  raise notice 'ok 1c: and the fixture does have one, so 1a is a real test';
end;
$$;

-- A brand new profile, created the way the signup trigger creates one.
insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000004', 'fresh@example.test')
on conflict (id) do nothing;

do $$
declare fresh public.profiles;
begin
  select * into fresh from public.profiles
  where id = 'a0000000-0000-4000-8000-000000000004';

  if fresh.id is null then
    raise exception 'FAIL 1d: no profile row was created for a new account';
  end if;
  if fresh.show_phone or fresh.show_email then
    raise exception 'FAIL 1d: a new profile publishes contact details';
  end if;
  raise notice 'ok 1d: a new profile publishes nothing';
end;
$$;

-- ===================================================================
-- 2. The owner can turn it on, and only for themselves.
-- ===================================================================
set role authenticated;
set local request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000001';

do $$
declare shown boolean;
declare touched integer;
begin
  update public.profiles set show_phone = true
  where id = 'a0000000-0000-4000-8000-000000000001';

  select show_phone into shown from public.profiles
  where id = 'a0000000-0000-4000-8000-000000000001';
  if not shown then
    raise exception 'FAIL 2a: the owner cannot publish their own number';
  end if;
  raise notice 'ok 2a: the owner can publish their own number';

  update public.profiles set show_phone = true
  where id = 'a0000000-0000-4000-8000-000000000002';
  get diagnostics touched = row_count;
  if touched <> 0 then
    raise exception 'FAIL 2b: a member published somebody else''s number';
  end if;
  raise notice 'ok 2b: nobody can publish somebody else''s';

  -- The 0068 guard still holds: this column is new and ordinary, and adding
  -- it must not have made the badge writable alongside it.
  begin
    update public.profiles set phone_verified = true
    where id = 'a0000000-0000-4000-8000-000000000001';
    raise exception 'FAIL 2c: the verified badge became self-grantable';
  exception
    when raise_exception then
      raise notice 'ok 2c: the verified badge is still guarded';
  end;
end;
$$;

-- ===================================================================
-- 3. The rating covers a person's services, not only reviews of them.
-- ===================================================================
reset role;

insert into public.services (id, provider_id, title, slug, status) values
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   'Concrete works', 'concrete-works-probe', 'published'),
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001',
   'Draft service', 'draft-service-probe', 'draft');

-- Two reviews at five stars and one at four, deliberately. With one of each
-- the histogram cannot tell a swapped bucket from a correct one: an aggregate
-- that counted fours as fives reported the same three ones and passed.
insert into public.reviews (author_id, subject_type, subject_id, rating, verified) values
  -- Three on the published service.
  ('a0000000-0000-4000-8000-000000000002', 'service', 'b0000000-0000-4000-8000-000000000001', 5, true),
  ('a0000000-0000-4000-8000-000000000005', 'service', 'b0000000-0000-4000-8000-000000000001', 5, false),
  ('a0000000-0000-4000-8000-000000000003', 'service', 'b0000000-0000-4000-8000-000000000001', 3, false),
  -- One against the person directly.
  ('a0000000-0000-4000-8000-000000000002', 'professional', 'a0000000-0000-4000-8000-000000000001', 4, false),
  -- One on a draft service, which is not public and must not count.
  ('a0000000-0000-4000-8000-000000000003', 'service', 'b0000000-0000-4000-8000-000000000002', 1, false),
  -- And one belonging to somebody else entirely.
  ('a0000000-0000-4000-8000-000000000002', 'professional', 'a0000000-0000-4000-8000-000000000003', 1, false);

set role authenticated;
set local request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000002';

do $$
declare r record;
begin
  select * into r from public.professional_reputation('a0000000-0000-4000-8000-000000000001');

  if r.total <> 4 then
    raise exception 'FAIL 3a: counted % reviews, expected 4 (5, 5, 3 on a service and 4 direct)', r.total;
  end if;
  raise notice 'ok 3a: service reviews and direct reviews are counted together';

  -- (5 + 5 + 3 + 4) / 4 = 4.25
  if r.average <> 4.25 then
    raise exception 'FAIL 3b: average is %, expected 4.25', r.average;
  end if;
  raise notice 'ok 3b: the average is over both';

  if r.five <> 2 or r.four <> 1 or r.three <> 1 or r.two <> 0 or r.one <> 0 then
    raise exception 'FAIL 3c: histogram is % % % % %', r.five, r.four, r.three, r.two, r.one;
  end if;
  raise notice 'ok 3c: each star lands in its own bucket';

  -- A review on a service nobody can see would let somebody raise their own
  -- rating with a listing they never published.
  if r.service_count <> 1 then
    raise exception 'FAIL 3d: counted % services, expected 1 published', r.service_count;
  end if;
  raise notice 'ok 3d: an unpublished service is not counted';

  if r.verified_total <> 1 then
    raise exception 'FAIL 3e: % verified, expected 1', r.verified_total;
  end if;
  raise notice 'ok 3e: reviews backed by a transaction are counted apart';
end;
$$;

-- ===================================================================
-- 4. Somebody with nothing has nothing, rather than a default rating.
-- ===================================================================
do $$
declare r record;
begin
  select * into r from public.professional_reputation('a0000000-0000-4000-8000-000000000004');

  if r.total <> 0 then
    raise exception 'FAIL 4a: a profile with no reviews reports %', r.total;
  end if;
  if r.average <> 0 then
    raise exception 'FAIL 4a: a profile with no reviews has an average of %', r.average;
  end if;
  raise notice 'ok 4a: no reviews means no rating, not a starting score';
end;
$$;

-- ===================================================================
-- 5. A signed-out visitor sees the rating.
--
--    It is the reason somebody who arrived from a shared link stays, and
--    Medosha is public first.
--
--    Note what this cannot prove. Supabase grants EXECUTE on new functions in
--    `public` to anon and authenticated through ALTER DEFAULT PRIVILEGES, so
--    removing the explicit grant from the migration changes nothing here. The
--    meaningful line is the `revoke all ... from public` above it. That the
--    grant is written down anyway is checked in scripts/profile_check.ts,
--    where it is a fact about the file rather than about the database.
-- ===================================================================
reset role;
set role anon;

do $$
declare r record;
begin
  select * into r from public.professional_reputation('a0000000-0000-4000-8000-000000000001');
  if r.total <> 4 then
    raise exception 'FAIL 5a: a signed-out visitor sees % reviews', r.total;
  end if;
  raise notice 'ok 5a: a signed-out visitor sees the rating';
end;
$$;

rollback;
