-- Finding a person: the filters filter, and the order is not "most looked at".
--
-- Run after applying 0073. Prints one line per check and rolls itself back.
-- Run as `anon` for most of it — the whole point is that somebody looking for
-- a carpenter does not need an account.

begin;

insert into auth.users (id, email) values
  ('f1000000-0000-4000-8000-000000000001', 'carpenter@example.test'),
  ('f1000000-0000-4000-8000-000000000002', 'plumber@example.test'),
  ('f1000000-0000-4000-8000-000000000003', 'famous@example.test'),
  ('f1000000-0000-4000-8000-000000000004', 'banned@example.test'),
  ('f1000000-0000-4000-8000-000000000005', 'nohandle@example.test'),
  ('f1000000-0000-4000-8000-000000000006', 'solid@example.test'),
  ('f1000000-0000-4000-8000-000000000009', 'reviewer@example.test'),
  ('f1000000-0000-4000-8000-00000000000a', 'r2@example.test'),
  ('f1000000-0000-4000-8000-00000000000b', 'r3@example.test')
on conflict (id) do nothing;

-- Upserted: the auth.users insert fires the trigger that creates the profile,
-- so `do nothing` would leave every column below unset.
-- The plumber has typed a number in and never confirmed a code. Without that,
-- a "verified" filter reading `profiles.phone is not null` instead of
-- `phone_verified` excludes them either way and the check proves nothing —
-- which it did.
insert into public.profiles
  (id, username, full_name, bio, location_city, phone, phone_verified, work_status, profile_views, restricted_until)
values
  ('f1000000-0000-4000-8000-000000000001', 'probe_carpenter', 'Probe Carpenter',
   'Fitted wardrobes and kitchens', 'Addis Ababa', '+251900000031', true, 'available', 10, null),
  ('f1000000-0000-4000-8000-000000000002', 'probe_plumber', 'Probe Plumber',
   'Bathrooms and drainage', 'Hawassa', '+251900000032', false, 'fully_booked', 20, null),
  -- Reviewed more often, and by more people with a booking behind it, but
  -- rated lower. Separates "rating first" from "most verified first".
  ('f1000000-0000-4000-8000-000000000006', 'probe_solid', 'Probe Solid',
   'Steady work', 'Addis Ababa', null, true, 'available', 5, null),
  -- Nobody has ever reviewed this one, and it has by far the most views.
  ('f1000000-0000-4000-8000-000000000003', 'probe_famous', 'Probe Famous',
   'Everything, allegedly', 'Addis Ababa', null, true, 'available', 9999, null),
  -- Restricted by a moderator.
  ('f1000000-0000-4000-8000-000000000004', 'probe_banned', 'Probe Banned',
   'Carpenter', 'Addis Ababa', null, true, 'available', 500, now() + interval '30 days'),
  ('f1000000-0000-4000-8000-000000000009', 'probe_reviewer', 'Probe Reviewer',
   null, 'Addis Ababa', null, false, 'available', 0, null)
on conflict (id) do update set
  username = excluded.username,
  full_name = excluded.full_name,
  bio = excluded.bio,
  location_city = excluded.location_city,
  phone = excluded.phone,
  phone_verified = excluded.phone_verified,
  work_status = excluded.work_status,
  profile_views = excluded.profile_views,
  restricted_until = excluded.restricted_until;

-- No username, so no public page to send anybody to.
update public.profiles set username = null, full_name = 'No Handle'
where id = 'f1000000-0000-4000-8000-000000000005';

insert into public.service_categories (id, slug, name) values
  ('a1100000-0000-4000-8000-000000000001', 'joinery-probe', 'Joinery'),
  ('a1100000-0000-4000-8000-000000000002', 'plumbing-probe', 'Plumbing')
on conflict (id) do nothing;

insert into public.services (id, provider_id, category_id, title, slug, status) values
  ('b1100000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001',
   'a1100000-0000-4000-8000-000000000001', 'Wardrobes', 'wardrobes-probe-s', 'published'),
  ('b1100000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000002',
   'a1100000-0000-4000-8000-000000000002', 'Drainage', 'drainage-probe-s', 'published'),
  -- A draft: its category must not make its provider findable under it.
  ('b1100000-0000-4000-8000-000000000003', 'f1000000-0000-4000-8000-000000000003',
   'a1100000-0000-4000-8000-000000000001', 'Secret joinery', 'secret-joinery-probe', 'draft');

insert into public.reviews (author_id, subject_type, subject_id, rating, verified) values
  ('f1000000-0000-4000-8000-000000000009', 'service', 'b1100000-0000-4000-8000-000000000001', 5, true),
  ('f1000000-0000-4000-8000-000000000002', 'professional', 'f1000000-0000-4000-8000-000000000001', 4, false),
  ('f1000000-0000-4000-8000-000000000009', 'professional', 'f1000000-0000-4000-8000-000000000002', 3, false),
  -- On the *draft* service. It must reach nobody's rating: a listing nobody
  -- can see is not work anybody can vouch for.
  ('f1000000-0000-4000-8000-000000000009', 'service', 'b1100000-0000-4000-8000-000000000003', 5, true),
  -- Three verified fours for probe_solid: more verified reviews than the
  -- carpenter, and a lower average.
  ('f1000000-0000-4000-8000-000000000009', 'professional', 'f1000000-0000-4000-8000-000000000006', 4, true),
  ('f1000000-0000-4000-8000-00000000000a', 'professional', 'f1000000-0000-4000-8000-000000000006', 4, true),
  ('f1000000-0000-4000-8000-00000000000b', 'professional', 'f1000000-0000-4000-8000-000000000006', 4, true);

-- Enough rows that a limit of 5000 would return more than the cap if the cap
-- were removed. With a handful of fixtures the cap is unobservable and the
-- check passed on a function that had none.
insert into auth.users (id, email)
select ('f2000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'filler' || n || '@example.test'
from generate_series(1, 70) n
on conflict (id) do nothing;

update public.profiles p
set username = 'probe_filler_' || right(p.id::text, 4),
    full_name = 'Probe Filler',
    location_city = 'Dire Dawa'
where p.id::text like 'f2000000-0000-4000-8000-%';

set role anon;

-- ===================================================================
-- 1. A signed-out visitor can search at all.
-- ===================================================================
do $$
declare found integer;
begin
  select count(*) into found from public.search_professionals();
  if found = 0 then
    raise exception 'FAIL 1a: a signed-out visitor finds nobody';
  end if;
  raise notice 'ok 1a: a signed-out visitor can search';
end;
$$;

-- ===================================================================
-- 2. Who is excluded, and why.
-- ===================================================================
do $$
declare hit integer;
begin
  select count(*) into hit from public.search_professionals()
  where username = 'probe_banned';
  if hit <> 0 then
    raise exception 'FAIL 2a: a restricted account is recommended to buyers';
  end if;
  raise notice 'ok 2a: a restricted account is not recommended';

  select count(*) into hit from public.search_professionals(p_query => 'No Handle');
  if hit <> 0 then
    raise exception 'FAIL 2b: somebody with no public page is listed';
  end if;
  raise notice 'ok 2b: somebody with no username is not listed';
end;
$$;

-- A restriction that has run out is not a restriction.
reset role;
update public.profiles set restricted_until = now() - interval '1 day'
where id = 'f1000000-0000-4000-8000-000000000004';
set role anon;

do $$
declare hit integer;
begin
  select count(*) into hit from public.search_professionals()
  where username = 'probe_banned';
  if hit <> 1 then
    raise exception 'FAIL 2c: an expired restriction still hides the account';
  end if;
  raise notice 'ok 2c: an expired restriction does not';
end;
$$;

reset role;
update public.profiles set restricted_until = now() + interval '30 days'
where id = 'f1000000-0000-4000-8000-000000000004';
set role anon;

-- ===================================================================
-- 3. The filters.
-- ===================================================================
do $$
declare r record;
declare hit integer;
begin
  select count(*) into hit from public.search_professionals(p_category => 'joinery-probe');
  if hit <> 1 then
    raise exception 'FAIL 3a: the joinery filter returned %, expected 1', hit;
  end if;
  raise notice 'ok 3a: filtering by trade uses published services';

  -- The famous one has a *draft* joinery service. Being findable under a
  -- category nobody can see would let anybody claim any trade.
  select count(*) into hit from public.search_professionals(p_category => 'joinery-probe')
  where username = 'probe_famous';
  if hit <> 0 then
    raise exception 'FAIL 3b: a draft service made somebody findable under its trade';
  end if;
  raise notice 'ok 3b: a draft service does not';

  select count(*) into hit from public.search_professionals(p_city => 'Hawassa');
  if hit <> 1 then
    raise exception 'FAIL 3c: the city filter returned %, expected 1', hit;
  end if;
  raise notice 'ok 3c: filtering by city works';

  select count(*) into hit from public.search_professionals(p_verified_only => true)
  where username = 'probe_plumber';
  if hit <> 0 then
    raise exception 'FAIL 3d: an unverified professional passed the verified filter';
  end if;
  raise notice 'ok 3d: the verified filter needs a confirmed code';

  select count(*) into hit from public.search_professionals(p_available_only => true)
  where username = 'probe_plumber';
  if hit <> 0 then
    raise exception 'FAIL 3e: somebody fully booked passed the availability filter';
  end if;
  raise notice 'ok 3e: the availability filter excludes the fully booked';

  select count(*) into hit from public.search_professionals(p_min_rating => 4.5);
  if hit <> 1 then
    raise exception 'FAIL 3f: the rating filter returned %, expected 1', hit;
  end if;
  raise notice 'ok 3f: the rating filter works';

  -- Nobody has reviewed the famous one, so they have no rating. A minimum
  -- rating must exclude them rather than treating "none" as passing.
  select count(*) into hit from public.search_professionals(p_min_rating => 1)
  where username = 'probe_famous';
  if hit <> 0 then
    raise exception 'FAIL 3g: an unreviewed profile passed a minimum-rating filter';
  end if;
  raise notice 'ok 3g: no rating does not pass a rating filter';

  -- probe_famous's only review sits on their draft service.
  select count(*) into hit from public.search_professionals()
  where username = 'probe_famous' and review_count > 0;
  if hit <> 0 then
    raise exception 'FAIL 3i: a review on a draft service reached somebody''s rating';
  end if;
  raise notice 'ok 3i: a review on a draft service reaches nobody';

  -- The trade is searchable text even though it is not on the profile.
  select count(*) into hit from public.search_professionals(p_query => 'Joinery');
  if hit <> 1 then
    raise exception 'FAIL 3h: searching a trade name returned %, expected 1', hit;
  end if;
  raise notice 'ok 3h: the trade name is searchable';
end;
$$;

-- ===================================================================
-- 4. The numbers on each row.
-- ===================================================================
do $$
declare r record;
begin
  select * into r from public.search_professionals(p_query => 'Probe Carpenter');

  -- One five on the service and one four against the person.
  if r.review_count <> 2 then
    raise exception 'FAIL 4a: review_count is %, expected 2', r.review_count;
  end if;
  raise notice 'ok 4a: service reviews and direct reviews are counted together';

  if r.rating <> 4.50 then
    raise exception 'FAIL 4b: rating is %, expected 4.50', r.rating;
  end if;
  raise notice 'ok 4b: over both';

  if r.verified_reviews <> 1 then
    raise exception 'FAIL 4c: verified_reviews is %, expected 1', r.verified_reviews;
  end if;
  raise notice 'ok 4c: reviews backed by a transaction are counted apart';

  if r.service_count <> 1 then
    raise exception 'FAIL 4d: service_count is %, expected 1', r.service_count;
  end if;
  raise notice 'ok 4d: published services are counted';

  if not (r.trades @> array['Joinery']) then
    raise exception 'FAIL 4e: trades are %, expected to contain Joinery', r.trades;
  end if;
  raise notice 'ok 4e: the trade comes from the service category';
end;
$$;

-- ===================================================================
-- 5. The order.
--
--    `global_search` ranks professionals by profile_views, which puts the
--    most looked-at profile first rather than the best one. This must not.
-- ===================================================================
do $$
declare first_row record;
declare famous_pos integer;
begin
  -- probe_solid has three verified reviews to the carpenter's one, and a
  -- lower average. Rating leads, so the carpenter is first — which is what
  -- separates "best rated" from "most reviewed".
  select * into first_row from public.search_professionals() limit 1;
  if first_row.username <> 'probe_carpenter' then
    raise exception 'FAIL 5a: first result is %, expected the highest-rated', first_row.username;
  end if;
  raise notice 'ok 5a: the highest-rated comes first, not the most reviewed';

  select position into famous_pos from (
    select username, row_number() over () as position
    from public.search_professionals()
  ) ranked where username = 'probe_famous';

  if famous_pos <= 2 then
    raise exception 'FAIL 5b: an unreviewed profile with 9999 views ranks at %', famous_pos;
  end if;
  raise notice 'ok 5b: views alone do not outrank being reviewed';
end;
$$;

-- ===================================================================
-- 6. Paging.
-- ===================================================================
do $$
declare total bigint;
declare page_size integer;
begin
  select count(*), max(total_count) into page_size, total
  from public.search_professionals(p_limit => 2);

  if page_size <> 2 then
    raise exception 'FAIL 6a: a limit of 2 returned % rows', page_size;
  end if;
  raise notice 'ok 6a: the limit is honoured';

  if total <= 2 then
    raise exception 'FAIL 6b: total_count is %, which is the page and not the total', total;
  end if;
  raise notice 'ok 6b: total_count counts past the page';

  -- A caller cannot ask for the whole table by passing a huge limit.
  select count(*) into page_size from public.search_professionals(p_limit => 5000);
  if page_size <> 60 then
    raise exception 'FAIL 6c: a limit of 5000 returned % rows, expected the cap of 60', page_size;
  end if;
  raise notice 'ok 6c: the limit is capped at 60';
end;
$$;

rollback;
