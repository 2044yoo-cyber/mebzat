-- A business page shows numbers somebody computed, not columns nobody writes.
--
-- Run after applying 0072. Prints one line per check and rolls itself back.
--
-- Run as `authenticated` and once as `anon`. The aggregate is `security
-- definer` over tables with policies, so a superuser run would report success
-- without establishing what a visitor sees.

begin;

insert into auth.users (id, email) values
  ('c0000000-0000-4000-8000-000000000001', 'co_owner@example.test'),
  ('c0000000-0000-4000-8000-000000000002', 'co_client1@example.test'),
  ('c0000000-0000-4000-8000-000000000003', 'co_client2@example.test'),
  ('c0000000-0000-4000-8000-000000000004', 'co_client3@example.test')
on conflict (id) do nothing;

insert into public.profiles (id, username) values
  ('c0000000-0000-4000-8000-000000000001', 'co_owner'),
  ('c0000000-0000-4000-8000-000000000002', 'co_client1'),
  ('c0000000-0000-4000-8000-000000000003', 'co_client2'),
  ('c0000000-0000-4000-8000-000000000004', 'co_client3')
on conflict (id) do update set username = excluded.username;

-- An imported listing carrying a rating nobody computed, which is the state
-- the directory is actually in.
insert into public.companies (id, slug, name, category, rating, review_count, followers_count, is_claimed)
values
  ('d0000000-0000-4000-8000-000000000001', 'probe-joinery', 'Probe Joinery',
   'Joinery and furniture', 4.90, 0, 0, true),
  ('d0000000-0000-4000-8000-000000000002', 'probe-empty', 'Probe Empty',
   'Joinery and furniture', 5.00, 0, 0, false);

-- ===================================================================
-- 1. A rating nobody wrote does not survive.
--
--    These fixtures are inserted after the migration has run, so what
--    is exercised here is the trigger. Section 6 exercises the
--    backfill, which is the half that has to correct data already in
--    the table.
-- ===================================================================
insert into public.reviews (author_id, subject_type, subject_id, rating, verified) values
  ('c0000000-0000-4000-8000-000000000002', 'company', 'd0000000-0000-4000-8000-000000000001', 5, true),
  ('c0000000-0000-4000-8000-000000000003', 'company', 'd0000000-0000-4000-8000-000000000001', 3, false);

do $$
declare c public.companies;
begin
  select * into c from public.companies where id = 'd0000000-0000-4000-8000-000000000001';

  if c.review_count <> 2 then
    raise exception 'FAIL 1a: review_count is %, expected 2', c.review_count;
  end if;
  raise notice 'ok 1a: reviews of a company are counted';

  if c.rating <> 4.00 then
    raise exception 'FAIL 1b: rating is %, expected 4.00 — the imported 4.90 survived', c.rating;
  end if;
  raise notice 'ok 1b: the rating is recomputed, not left as imported';
end;
$$;

-- Deleting a review must move the average back, or a business can post a
-- five, keep the average and remove the evidence.
delete from public.reviews
where subject_type = 'company'
  and subject_id = 'd0000000-0000-4000-8000-000000000001'
  and rating = 3;

do $$
declare c public.companies;
begin
  select * into c from public.companies where id = 'd0000000-0000-4000-8000-000000000001';
  if c.rating <> 5.00 or c.review_count <> 1 then
    raise exception 'FAIL 1c: after a deletion, rating % over % reviews', c.rating, c.review_count;
  end if;
  raise notice 'ok 1c: deleting a review moves the average';
end;
$$;

-- ===================================================================
-- 2. No reviews means no rating, not a zero and not an import.
-- ===================================================================
insert into public.reviews (author_id, subject_type, subject_id, rating) values
  ('c0000000-0000-4000-8000-000000000002', 'company', 'd0000000-0000-4000-8000-000000000002', 4);
delete from public.reviews
where subject_type = 'company' and subject_id = 'd0000000-0000-4000-8000-000000000002';

do $$
declare c public.companies;
begin
  select * into c from public.companies where id = 'd0000000-0000-4000-8000-000000000002';
  if c.rating is not null then
    raise exception 'FAIL 2a: a company with no reviews has a rating of %', c.rating;
  end if;
  raise notice 'ok 2a: no reviews leaves the rating null, not zero';

  if c.review_count <> 0 then
    raise exception 'FAIL 2b: review_count is %', c.review_count;
  end if;
  raise notice 'ok 2b: and the count at nought';
end;
$$;

-- ===================================================================
-- 3. Followers are counted.
-- ===================================================================
set role authenticated;
set local request.jwt.claim.sub = 'c0000000-0000-4000-8000-000000000002';
insert into public.follows (follower_id, target_type, target_id)
values ('c0000000-0000-4000-8000-000000000002', 'company', 'd0000000-0000-4000-8000-000000000001');

set local request.jwt.claim.sub = 'c0000000-0000-4000-8000-000000000003';
insert into public.follows (follower_id, target_type, target_id)
values ('c0000000-0000-4000-8000-000000000003', 'company', 'd0000000-0000-4000-8000-000000000001');

reset role;

do $$
declare c public.companies;
begin
  select * into c from public.companies where id = 'd0000000-0000-4000-8000-000000000001';
  if c.followers_count <> 2 then
    raise exception 'FAIL 3a: followers_count is %, expected 2', c.followers_count;
  end if;
  raise notice 'ok 3a: following a company counts';
end;
$$;

delete from public.follows
where follower_id = 'c0000000-0000-4000-8000-000000000003'
  and target_type = 'company'
  and target_id = 'd0000000-0000-4000-8000-000000000001';

do $$
declare c public.companies;
declare other public.companies;
begin
  select * into c from public.companies where id = 'd0000000-0000-4000-8000-000000000001';
  if c.followers_count <> 1 then
    raise exception 'FAIL 3b: after unfollowing, count is %', c.followers_count;
  end if;
  raise notice 'ok 3b: unfollowing counts too';

  select * into other from public.companies where id = 'd0000000-0000-4000-8000-000000000002';
  if other.followers_count <> 0 then
    raise exception 'FAIL 3c: an unrelated company gained % followers', other.followers_count;
  end if;
  raise notice 'ok 3c: and only that company moves';
end;
$$;

-- A follow of something that is not a company must not touch any company row.
insert into public.follows (follower_id, target_type, target_id)
values ('c0000000-0000-4000-8000-000000000002', 'profile', 'c0000000-0000-4000-8000-000000000001');

do $$
declare c public.companies;
begin
  select * into c from public.companies where id = 'd0000000-0000-4000-8000-000000000001';
  if c.followers_count <> 1 then
    raise exception 'FAIL 3d: following a person changed a company count to %', c.followers_count;
  end if;
  raise notice 'ok 3d: following a person leaves companies alone';
end;
$$;

-- ===================================================================
-- 4. Standing spans the business and the services it sells.
-- ===================================================================
insert into public.services (id, provider_id, company_id, title, slug, status) values
  ('e0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
   'd0000000-0000-4000-8000-000000000001', 'Fitted wardrobes', 'fitted-wardrobes-probe', 'published'),
  ('e0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001',
   'd0000000-0000-4000-8000-000000000001', 'Hidden service', 'hidden-service-probe', 'draft');

-- Two fives and one four, deliberately: with one review at each star an
-- aggregate that counted fours as fives would report the same histogram.
insert into public.reviews (author_id, subject_type, subject_id, rating, verified) values
  ('c0000000-0000-4000-8000-000000000002', 'service', 'e0000000-0000-4000-8000-000000000001', 5, false),
  ('c0000000-0000-4000-8000-000000000003', 'service', 'e0000000-0000-4000-8000-000000000001', 4, false),
  ('c0000000-0000-4000-8000-000000000004', 'service', 'e0000000-0000-4000-8000-000000000002', 1, false);

set role authenticated;
set local request.jwt.claim.sub = 'c0000000-0000-4000-8000-000000000002';

do $$
declare r record;
begin
  select * into r from public.company_reputation('d0000000-0000-4000-8000-000000000001');

  -- One review of the company (5, verified) plus two of the published
  -- service (5, 4). The draft service's 1 is not public and must not count.
  if r.total <> 3 then
    raise exception 'FAIL 4a: counted % reviews, expected 3', r.total;
  end if;
  raise notice 'ok 4a: company reviews and service reviews are counted together';

  if r.average <> 4.67 then
    raise exception 'FAIL 4b: average is %, expected 4.67', r.average;
  end if;
  raise notice 'ok 4b: over both';

  if r.five <> 2 or r.four <> 1 or r.three <> 0 then
    raise exception 'FAIL 4c: histogram is % % %', r.five, r.four, r.three;
  end if;
  raise notice 'ok 4c: each star lands in its own bucket';

  if r.service_count <> 1 then
    raise exception 'FAIL 4d: counted % services, expected 1 published', r.service_count;
  end if;
  raise notice 'ok 4d: a draft service is not counted';

  if r.verified_total <> 1 then
    raise exception 'FAIL 4e: % verified, expected 1', r.verified_total;
  end if;
  raise notice 'ok 4e: reviews backed by a transaction are counted apart';
end;
$$;

do $$
declare r record;
begin
  select * into r from public.company_reputation('d0000000-0000-4000-8000-000000000002');
  if r.total <> 0 or r.average <> 0 then
    raise exception 'FAIL 4f: an unreviewed company reports % at %', r.total, r.average;
  end if;
  raise notice 'ok 4f: an unreviewed business gets nothing, not a starting score';
end;
$$;

-- 0072 replaces refresh_review_aggregates() to teach it about companies. The
-- service and equipment branches it already had have to still work, or adding
-- one subject would have silently stopped maintaining the other two.
do $$
declare svc public.services;
begin
  select * into svc from public.services
  where id = 'e0000000-0000-4000-8000-000000000001';

  if svc.review_count <> 2 then
    raise exception 'FAIL 4g: service review_count is %, expected 2', svc.review_count;
  end if;
  if svc.rating <> 4.50 then
    raise exception 'FAIL 4g: service rating is %, expected 4.50', svc.rating;
  end if;
  raise notice 'ok 4g: services are still aggregated, as they were before';
end;
$$;

-- ===================================================================
-- 5. A signed-out visitor sees it.
-- ===================================================================
reset role;
set role anon;

do $$
declare r record;
begin
  select * into r from public.company_reputation('d0000000-0000-4000-8000-000000000001');
  if r.total <> 3 then
    raise exception 'FAIL 5a: a signed-out visitor sees % reviews', r.total;
  end if;
  raise notice 'ok 5a: a signed-out visitor sees the rating';
end;
$$;

-- ===================================================================
-- 6. The backfill corrects what is already in the table.
--
--    This is the half a test normally cannot reach: the migration ran
--    before these fixtures existed. Extracting it into a function is
--    what makes it checkable — and gives whoever runs an import a
--    repair to call.
-- ===================================================================
reset role;

-- Put the table back into the state the directory was actually in: an
-- imported rating with no reviews behind it, a real rating overwritten with a
-- flattering one, and follower counts that bear no relation to the follows.
update public.companies
set rating = 4.90, review_count = 0, followers_count = 99
where id = 'd0000000-0000-4000-8000-000000000001';

update public.companies
set rating = 5.00, review_count = 7, followers_count = 42
where id = 'd0000000-0000-4000-8000-000000000002';

select public.refresh_company_aggregates();

do $$
declare reviewed public.companies;
declare empty public.companies;
begin
  select * into reviewed from public.companies
  where id = 'd0000000-0000-4000-8000-000000000001';
  select * into empty from public.companies
  where id = 'd0000000-0000-4000-8000-000000000002';

  -- One company review remains from section 1, at five stars.
  if reviewed.rating <> 5.00 or reviewed.review_count <> 1 then
    raise exception 'FAIL 6a: backfill left rating % over % reviews',
      reviewed.rating, reviewed.review_count;
  end if;
  raise notice 'ok 6a: the backfill recomputes an existing rating';

  if empty.rating is not null or empty.review_count <> 0 then
    raise exception 'FAIL 6b: an imported rating with no reviews survived (% over %)',
      empty.rating, empty.review_count;
  end if;
  raise notice 'ok 6b: and clears one that never had reviews behind it';

  if reviewed.followers_count <> 1 then
    raise exception 'FAIL 6c: followers_count is % after backfill, expected 1',
      reviewed.followers_count;
  end if;
  raise notice 'ok 6c: follower counts are recomputed';

  if empty.followers_count <> 0 then
    raise exception 'FAIL 6d: a company nobody follows kept % followers',
      empty.followers_count;
  end if;
  raise notice 'ok 6d: and cleared where there are none';
end;
$$;

-- ===================================================================
-- 7. The recommendation sort orders by something.
-- ===================================================================

do $$
declare source text;
begin
  select pg_get_functiondef(p.oid) into source
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'berchuma_workshops';

  if position('c.projects_completed desc' in source) > 0 then
    raise exception 'FAIL 7a: workshops are still sorted by a column nothing writes';
  end if;
  raise notice 'ok 7a: the dead tie-breaker is gone';

  if position('c.review_count desc' in source) = 0 then
    raise exception 'FAIL 7b: nothing replaced it';
  end if;
  raise notice 'ok 7b: replaced by one that moves';
end;
$$;

rollback;
