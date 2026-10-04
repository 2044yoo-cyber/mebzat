-- Uncertainty does not block a seller, and a report takes the file out of view.
--
-- Run after applying 0076. Prints one line per check and rolls itself back.

begin;

insert into auth.users (id, email) values
  ('aa900000-0000-4000-8000-000000000001', 'seller@example.test'),
  ('aa900000-0000-4000-8000-000000000002', 'reporter_one@example.test'),
  ('aa900000-0000-4000-8000-000000000003', 'reporter_two@example.test'),
  ('aa900000-0000-4000-8000-000000000004', 'reporter_three@example.test'),
  ('aa900000-0000-4000-8000-000000000005', 'moderator@example.test')
on conflict (id) do nothing;

insert into public.profiles (id, username, is_moderator) values
  ('aa900000-0000-4000-8000-000000000005', 'probe_moderator', true)
on conflict (id) do update set username = excluded.username,
                               is_moderator = excluded.is_moderator;

-- ===================================================================
-- 1. A `review` verdict may be published.
--
--    This is the whole change: the seller is not held at the door
--    while somebody decides, because most of what lands in `review` is
--    fine and the alternative is nobody selling anything on a day the
--    classifier is unavailable.
-- ===================================================================
do $$
begin
  insert into public.moderation_items (id, content_type, user_id, status, public_path)
  values ('aa910000-0000-4000-8000-000000000001', 'product_image',
          'aa900000-0000-4000-8000-000000000001', 'review', 'seller/one.jpg');
  raise notice 'ok 1a: an image under review can be published';
exception
  when check_violation then
    raise exception 'FAIL 1a: a review verdict still blocks publishing';
end;
$$;

do $$
begin
  begin
    insert into public.moderation_items (content_type, user_id, status, public_path)
    values ('product_image', 'aa900000-0000-4000-8000-000000000001',
            'blocked', 'seller/blocked.jpg');
    raise exception 'FAIL 1b: a blocked image was published';
  exception
    when check_violation then
      raise notice 'ok 1b: a blocked image still cannot be';
  end;

  begin
    insert into public.moderation_items (content_type, user_id, status, public_path)
    values ('product_image', 'aa900000-0000-4000-8000-000000000001',
            'pending', 'seller/pending.jpg');
    raise exception 'FAIL 1c: an unchecked image was published';
  exception
    when check_violation then
      raise notice 'ok 1c: nor one nothing has looked at yet';
  end;

  -- The rule the whole system exists for is untouched.
  begin
    insert into public.moderation_items (content_type, user_id, status, category)
    values ('product_image', 'aa900000-0000-4000-8000-000000000001',
            'safe', 'sexual_minors');
    raise exception 'FAIL 1d: suspected material involving a child was marked safe';
  exception
    when check_violation then
      raise notice 'ok 1d: and that rule is untouched';
  end;
end;
$$;

-- ===================================================================
-- 2. Reporting a published image works at all.
--
--    It did not. 0052 constrained `public_path is null or status =
--    'safe'` and then, in the same file, moved a reported item from
--    safe back to review — so every report on published content raised
--    a check violation, recorded nothing, and told nobody.
-- ===================================================================
insert into public.moderation_items (id, content_type, user_id, status, public_path)
values ('aa910000-0000-4000-8000-000000000002', 'product_image',
        'aa900000-0000-4000-8000-000000000001', 'safe', 'seller/two.jpg');

do $$
declare it public.moderation_items;
begin
  insert into public.moderation_reports (item_id, reporter_id, category)
  values ('aa910000-0000-4000-8000-000000000002',
          'aa900000-0000-4000-8000-000000000002', 'spam');

  select * into it from public.moderation_items
  where id = 'aa910000-0000-4000-8000-000000000002';

  if it.report_count <> 1 then
    raise exception 'FAIL 2a: the report was not counted';
  end if;
  raise notice 'ok 2a: a published image can be reported';

  if it.status <> 'review' then
    raise exception 'FAIL 2b: a reported item is %, expected review', it.status;
  end if;
  raise notice 'ok 2b: and goes back for another look';

  -- One person's opinion must not unpublish somebody's work.
  if it.hidden_at is not null then
    raise exception 'FAIL 2c: one spam report hid the file';
  end if;
  raise notice 'ok 2c: one report does not hide it';
exception
  when check_violation then
    raise exception 'FAIL 2a: reporting a published image still raises %', SQLERRM;
end;
$$;

-- ===================================================================
-- 3. Three reports do.
-- ===================================================================
insert into public.moderation_reports (item_id, reporter_id, category) values
  ('aa910000-0000-4000-8000-000000000002', 'aa900000-0000-4000-8000-000000000003', 'spam'),
  ('aa910000-0000-4000-8000-000000000002', 'aa900000-0000-4000-8000-000000000004', 'spam');

do $$
declare it public.moderation_items;
declare told integer;
begin
  select * into it from public.moderation_items
  where id = 'aa910000-0000-4000-8000-000000000002';

  if it.report_count <> 3 then
    raise exception 'FAIL 3a: % reports counted, expected 3', it.report_count;
  end if;
  if it.hidden_at is null then
    raise exception 'FAIL 3a: three reports did not hide the file';
  end if;
  raise notice 'ok 3a: three reports hide it';

  if it.hidden_reason not like '%3 people%' then
    raise exception 'FAIL 3b: the reason says "%"', it.hidden_reason;
  end if;
  raise notice 'ok 3b: and say why';

  select count(*) into told from public.notifications n
  where n.user_id = 'aa900000-0000-4000-8000-000000000005'
    and n.title = 'Content hidden pending review';
  if told <> 1 then
    raise exception 'FAIL 3c: moderators were told % times, expected 1', told;
  end if;
  raise notice 'ok 3c: and a moderator is told, once';
end;
$$;

-- A fourth report must not hide it again, or notify again.
insert into public.moderation_reports (item_id, reporter_id, category)
values ('aa910000-0000-4000-8000-000000000002',
        'aa900000-0000-4000-8000-000000000005', 'spam');

do $$
declare told integer;
begin
  select count(*) into told from public.notifications n
  where n.user_id = 'aa900000-0000-4000-8000-000000000005'
    and n.title = 'Content hidden pending review';
  if told <> 1 then
    raise exception 'FAIL 3d: moderators told % times after a fourth report', told;
  end if;
  raise notice 'ok 3d: already-hidden content does not tell them again';
end;
$$;

-- ===================================================================
-- 4. One report is enough when being wrong is expensive.
-- ===================================================================
insert into public.moderation_items (id, content_type, user_id, status, public_path)
values ('aa910000-0000-4000-8000-000000000003', 'product_image',
        'aa900000-0000-4000-8000-000000000001', 'safe', 'seller/three.jpg');

insert into public.moderation_reports (item_id, reporter_id, category)
values ('aa910000-0000-4000-8000-000000000003',
        'aa900000-0000-4000-8000-000000000002', 'sexual_explicit');

do $$
declare it public.moderation_items;
begin
  select * into it from public.moderation_items
  where id = 'aa910000-0000-4000-8000-000000000003';
  if it.hidden_at is null then
    raise exception 'FAIL 4a: one report of explicit content did not hide it';
  end if;
  raise notice 'ok 4a: one report in a severe category hides it at once';
  if it.hidden_reason not like '%sexual_explicit%' then
    raise exception 'FAIL 4b: the reason says "%"', it.hidden_reason;
  end if;
  raise notice 'ok 4b: naming the category that did it';
end;
$$;

-- Something never published has nothing to hide.
insert into public.moderation_items (id, content_type, user_id, status)
values ('aa910000-0000-4000-8000-000000000004', 'product_image',
        'aa900000-0000-4000-8000-000000000001', 'review');

insert into public.moderation_reports (item_id, reporter_id, category)
values ('aa910000-0000-4000-8000-000000000004',
        'aa900000-0000-4000-8000-000000000002', 'illegal');

do $$
declare it public.moderation_items;
begin
  select * into it from public.moderation_items
  where id = 'aa910000-0000-4000-8000-000000000004';
  if it.hidden_at is not null then
    raise exception 'FAIL 4c: something with no public copy was marked hidden';
  end if;
  raise notice 'ok 4c: nothing published, nothing to hide';
end;
$$;

-- ===================================================================
-- 5. Rental and digital files.
-- ===================================================================
insert into public.profiles (id, username) values
  ('aa900000-0000-4000-8000-000000000001', 'probe_seller_76')
on conflict (id) do update set username = excluded.username;

set role authenticated;
set local request.jwt.claim.sub = 'aa900000-0000-4000-8000-000000000001';

do $$
begin
  begin
    insert into public.products (owner_id, title, slug, status, fulfilment)
    values ('aa900000-0000-4000-8000-000000000001',
            'Periodless rental', 'probe-periodless', 'published', 'rental');
    raise exception 'FAIL 5a: a rental was published with no period';
  exception
    when check_violation then raise notice 'ok 5a: a rental must say per what';
  end;

  begin
    insert into public.products (owner_id, title, slug, status, rental_period)
    values ('aa900000-0000-4000-8000-000000000001',
            'Physical with a period', 'probe-phys-period', 'published', 'daily');
    raise exception 'FAIL 5b: a physical listing accepted a rental period';
  exception
    when check_violation then raise notice 'ok 5b: and only a rental has one';
  end;

  begin
    insert into public.products (owner_id, title, slug, status, digital_file_path)
    values ('aa900000-0000-4000-8000-000000000001',
            'Physical with a file', 'probe-phys-file', 'published', 'x/y.zip');
    raise exception 'FAIL 5c: a physical listing carried a digital file';
  exception
    when check_violation then raise notice 'ok 5c: only a file has a file';
  end;

  insert into public.products (owner_id, title, slug, status, fulfilment,
                               rental_period, rental_deposit, price)
  values ('aa900000-0000-4000-8000-000000000001',
          'Scaffold tower', 'probe-scaffold', 'published', 'rental',
          'daily', 2000, 350);
  raise notice 'ok 5d: a rental listing takes a rate, a period and a deposit';

  insert into public.products (owner_id, title, slug, status, fulfilment,
                               digital_kind, digital_file_path, digital_file_name)
  values ('aa900000-0000-4000-8000-000000000001',
          'A plan with a file', 'probe-plan-file', 'published', 'digital',
          'floor_plan', 'aa900000-0000-4000-8000-000000000001/plan.zip', 'plan.zip');
  raise notice 'ok 5e: and a digital listing takes the file it is selling';
end;
$$;

-- ===================================================================
-- 6. The four sections stay disjoint.
-- ===================================================================
do $$
declare new_items integer;
declare used_items integer;
declare rental integer;
declare digital integer;
declare total integer;
begin
  select
    count(*) filter (where fulfilment = 'physical' and condition = 'new'),
    count(*) filter (where fulfilment = 'physical' and condition <> 'new'),
    count(*) filter (where fulfilment = 'rental'),
    count(*) filter (where fulfilment = 'digital'),
    count(*)
  into new_items, used_items, rental, digital, total
  from public.products
  where status = 'published'
    and owner_id = 'aa900000-0000-4000-8000-000000000001';

  if new_items + used_items + rental + digital <> total then
    raise exception 'FAIL 6a: % + % + % + % does not account for %',
      new_items, used_items, rental, digital, total;
  end if;
  raise notice 'ok 6a: every listing is in exactly one of the four sections';

  if rental <> 1 or digital <> 1 then
    raise exception 'FAIL 6b: % rental, % digital', rental, digital;
  end if;
  raise notice 'ok 6b: and in the one its column says';
end;
$$;

-- ===================================================================
-- 7. The file being sold is not public.
-- ===================================================================
reset role;

do $$
declare is_public boolean;
begin
  select public into is_public from storage.buckets where id = 'digital-goods';
  if is_public is null then
    raise exception 'FAIL 7a: there is no bucket for digital goods';
  end if;
  if is_public then
    raise exception 'FAIL 7a: the file being sold is in a public bucket';
  end if;
  raise notice 'ok 7a: the file being sold is private';

  if exists (
    select 1 from pg_policies
    where tablename = 'objects'
      and qual ilike '%digital-goods%'
      and roles::text[] @> array['anon']
  ) then
    raise exception 'FAIL 7b: anon has a policy on digital-goods';
  end if;
  raise notice 'ok 7b: and not readable without an account';
end;
$$;

insert into storage.objects (bucket_id, name) values
  ('digital-goods', 'aa900000-0000-4000-8000-000000000001/plan.zip'),
  ('digital-goods', 'aa900000-0000-4000-8000-000000000002/other.zip');

set role authenticated;
set local request.jwt.claim.sub = 'aa900000-0000-4000-8000-000000000002';

do $$
declare seen integer;
begin
  select count(*) into seen from storage.objects
  where bucket_id = 'digital-goods'
    and name like 'aa900000-0000-4000-8000-000000000001/%';
  if seen <> 0 then
    raise exception 'FAIL 7c: a member can read somebody else''s digital goods';
  end if;
  raise notice 'ok 7c: a member cannot read somebody else''s file';

  begin
    insert into storage.objects (bucket_id, name)
    values ('digital-goods', 'aa900000-0000-4000-8000-000000000001/stolen.zip');
    raise exception 'FAIL 7d: a member wrote into somebody else''s folder';
  exception
    when insufficient_privilege then
      raise notice 'ok 7d: nor write into their folder';
  end;
end;
$$;

rollback;
