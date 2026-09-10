-- The three marketplace sections are disjoint, and a digital listing says so
-- in the same column the section is read from.
--
-- Run after applying 0075. Prints one line per check and rolls itself back.
-- Run as `authenticated`: products has policies, and a superuser run would
-- report that a seller can do things row-level security forbids.

begin;

insert into auth.users (id, email) values
  ('e5000000-0000-4000-8000-000000000001', 'digital_seller@example.test')
on conflict (id) do nothing;

insert into public.profiles (id, username) values
  ('e5000000-0000-4000-8000-000000000001', 'probe_digital')
on conflict (id) do update set username = excluded.username;

-- ===================================================================
-- 1. Everything that already exists is physical, and stays where it was.
-- ===================================================================
set role authenticated;
set local request.jwt.claim.sub = 'e5000000-0000-4000-8000-000000000001';

insert into public.products (id, owner_id, title, slug, status)
values ('e5100000-0000-4000-8000-000000000001',
        'e5000000-0000-4000-8000-000000000001',
        'A physical thing', 'probe-physical-thing', 'published');

do $$
declare p public.products;
begin
  select * into p from public.products
  where id = 'e5100000-0000-4000-8000-000000000001';

  if p.fulfilment <> 'physical' then
    raise exception 'FAIL 1a: a listing written without a fulfilment is %', p.fulfilment;
  end if;
  raise notice 'ok 1a: a listing that says nothing is physical';

  if p.digital_kind is not null or p.file_format is not null then
    raise exception 'FAIL 1b: a physical listing carries file details';
  end if;
  raise notice 'ok 1b: and carries no file details';

  if p.is_sample then
    raise exception 'FAIL 1c: an ordinary listing is marked as a sample';
  end if;
  raise notice 'ok 1c: nor is it a sample';
end;
$$;

-- ===================================================================
-- 2. A physical listing cannot carry file details.
-- ===================================================================
do $$
begin
  begin
    update public.products set digital_kind = 'course'
    where id = 'e5100000-0000-4000-8000-000000000001';
    raise exception 'FAIL 2a: a physical listing accepted a digital kind';
  exception
    when check_violation then raise notice 'ok 2a: a physical listing refuses a digital kind';
  end;

  begin
    update public.products set file_format = 'SKP'
    where id = 'e5100000-0000-4000-8000-000000000001';
    raise exception 'FAIL 2b: a physical listing accepted a file format';
  exception
    when check_violation then raise notice 'ok 2b: and a file format';
  end;

  begin
    update public.products set license = 'commercial'
    where id = 'e5100000-0000-4000-8000-000000000001';
    raise exception 'FAIL 2c: a physical listing accepted a licence';
  exception
    when check_violation then raise notice 'ok 2c: and a licence';
  end;

  begin
    update public.products set file_size_mb = 12
    where id = 'e5100000-0000-4000-8000-000000000001';
    raise exception 'FAIL 2d: a physical listing accepted a file size';
  exception
    when check_violation then raise notice 'ok 2d: and a file size';
  end;
end;
$$;

-- ===================================================================
-- 3. A digital listing needs a kind, and is never second-hand or
--    delivered in a van.
-- ===================================================================
do $$
begin
  begin
    insert into public.products (owner_id, title, slug, status, fulfilment)
    values ('e5000000-0000-4000-8000-000000000001',
            'Kindless', 'probe-kindless', 'published', 'digital');
    raise exception 'FAIL 3a: a digital listing was published with no kind';
  exception
    when check_violation then
      raise notice 'ok 3a: a digital listing must say what kind of file it is';
  end;

  begin
    insert into public.products (owner_id, title, slug, status, fulfilment,
                                 digital_kind, condition)
    values ('e5000000-0000-4000-8000-000000000001',
            'Second-hand file', 'probe-used-file', 'published', 'digital',
            'course', 'used');
    raise exception 'FAIL 3b: a digital listing was accepted as second-hand';
  exception
    when check_violation then
      raise notice 'ok 3b: a downloaded file is not second-hand';
  end;

  begin
    insert into public.products (owner_id, title, slug, status, fulfilment,
                                 digital_kind, delivery_available)
    values ('e5000000-0000-4000-8000-000000000001',
            'Posted file', 'probe-posted-file', 'published', 'digital',
            'course', true);
    raise exception 'FAIL 3c: a digital listing offered physical delivery';
  exception
    when check_violation then
      raise notice 'ok 3c: and does not come in a van';
  end;

  begin
    insert into public.products (owner_id, title, slug, status, fulfilment,
                                 digital_kind, file_size_mb)
    values ('e5000000-0000-4000-8000-000000000001',
            'Impossible size', 'probe-bad-size', 'published', 'digital',
            'course', 0);
    raise exception 'FAIL 3d: a file of zero megabytes was accepted';
  exception
    when check_violation then raise notice 'ok 3d: a file has a size or none at all';
  end;
end;
$$;

insert into public.products (
  id, owner_id, title, slug, status, fulfilment, digital_kind,
  file_format, file_size_mb, license
)
values ('e5100000-0000-4000-8000-000000000002',
        'e5000000-0000-4000-8000-000000000001',
        'A real digital product', 'probe-digital-thing', 'published',
        'digital', 'floor_plan', 'DWG + PDF', 46.0, 'commercial');

do $$
declare p public.products;
begin
  select * into p from public.products
  where id = 'e5100000-0000-4000-8000-000000000002';
  if p.digital_kind <> 'floor_plan' or p.license <> 'commercial' then
    raise exception 'FAIL 3e: stored % / %', p.digital_kind, p.license;
  end if;
  raise notice 'ok 3e: a digital listing keeps its kind and licence';
end;
$$;

-- ===================================================================
-- 4. The three sections are disjoint and cover everything.
--
--    Two rules on two columns. A listing that answered to two of them
--    would appear twice in the marketplace from one row.
-- ===================================================================
do $$
declare digital integer;
declare new_items integer;
declare used_items integer;
declare total integer;
begin
  select
    count(*) filter (where fulfilment = 'digital'),
    count(*) filter (where fulfilment = 'physical' and condition = 'new'),
    count(*) filter (where fulfilment = 'physical' and condition <> 'new'),
    count(*)
  into digital, new_items, used_items, total
  from public.products
  where status = 'published'
    and owner_id = 'e5000000-0000-4000-8000-000000000001';

  if digital + new_items + used_items <> total then
    raise exception 'FAIL 4a: % + % + % does not account for % listings',
      digital, new_items, used_items, total;
  end if;
  raise notice 'ok 4a: every listing is in exactly one section';

  if digital <> 1 or new_items <> 1 or used_items <> 0 then
    raise exception 'FAIL 4b: % digital, % new, % used', digital, new_items, used_items;
  end if;
  raise notice 'ok 4b: and in the one its columns say';
end;
$$;

-- A digital listing must not also be reachable under New Items, which is what
-- would happen if the new-items rule were `condition = 'new'` alone.
do $$
declare leaked integer;
begin
  select count(*) into leaked from public.products
  where status = 'published' and condition = 'new' and fulfilment = 'digital'
    and owner_id = 'e5000000-0000-4000-8000-000000000001';
  if leaked <> 1 then
    raise exception 'FAIL 4c: the fixture cannot detect the overlap';
  end if;
  raise notice 'ok 4c: a digital listing is condition new, so New Items must exclude it by fulfilment';
end;
$$;

-- ===================================================================
-- 5. The samples.
-- ===================================================================
reset role;

do $$
declare samples integer;
declare kinds text;
declare owner_demo boolean;
begin
  select count(*), string_agg(distinct digital_kind::text, ',' order by digital_kind::text)
  into samples, kinds
  from public.products where is_sample;

  if samples <> 5 then
    raise exception 'FAIL 5a: % sample listings, expected 5', samples;
  end if;
  raise notice 'ok 5a: five samples';

  if kinds <> 'course,floor_plan,model_3d,other,sketchup' then
    raise exception 'FAIL 5b: sample kinds are %', kinds;
  end if;
  raise notice 'ok 5b: one of every kind the section offers';

  -- A sample owned by an account that looks like a person is a listing
  -- somebody will try to buy from.
  select p.is_demo into owner_demo
  from public.profiles p
  join public.products pr on pr.owner_id = p.id
  where pr.is_sample limit 1;

  if not coalesce(owner_demo, false) then
    raise exception 'FAIL 5c: the samples are owned by an account not marked as a demo';
  end if;
  raise notice 'ok 5c: owned by an account that says it is not a real seller';

  if exists (select 1 from public.products where is_sample and fulfilment <> 'digital') then
    raise exception 'FAIL 5d: a sample was placed outside the digital section';
  end if;
  raise notice 'ok 5d: and all of them are in the section they illustrate';

  if not exists (
    select 1 from public.seed_content
    where batch = 'digital_samples_0075' and entity = 'products'
  ) then
    raise exception 'FAIL 5e: the samples are not registered, so they cannot be removed';
  end if;
  raise notice 'ok 5e: registered under a batch, so they can be taken out again';
end;
$$;

-- ===================================================================
-- 6. A stranger cannot move somebody else's listing between sections.
-- ===================================================================
set role authenticated;
set local request.jwt.claim.sub = 'e5000000-0000-4000-8000-000000000001';

do $$
declare touched integer;
begin
  update public.products set fulfilment = 'physical', digital_kind = null,
    file_format = null, file_size_mb = null, license = null
  where is_sample;
  get diagnostics touched = row_count;
  if touched <> 0 then
    raise exception 'FAIL 6a: a member moved Medosha''s sample listings';
  end if;
  raise notice 'ok 6a: a member cannot move somebody else''s listing';
end;
$$;

rollback;
