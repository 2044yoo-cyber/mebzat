-- The condition column is the only thing that decides which section a listing
-- is in, and a "used" label cannot exist without it.
--
-- Run after applying 0074. Prints one line per check and rolls itself back.
-- Run as `authenticated`, not as a superuser: the products table has policies,
-- and a superuser run would report that a seller can do things RLS forbids.

begin;

insert into auth.users (id, email) values
  ('11100000-0000-4000-8000-000000000001', 'seller@example.test'),
  ('11100000-0000-4000-8000-000000000002', 'stranger@example.test')
on conflict (id) do nothing;

insert into public.profiles (id, username) values
  ('11100000-0000-4000-8000-000000000001', 'probe_seller'),
  ('11100000-0000-4000-8000-000000000002', 'probe_stranger')
on conflict (id) do update set username = excluded.username;

-- ===================================================================
-- 1. Everything that already exists is new, and stays where it was.
-- ===================================================================
set role authenticated;
set local request.jwt.claim.sub = '11100000-0000-4000-8000-000000000001';

insert into public.products (id, owner_id, title, slug, status)
values ('22200000-0000-4000-8000-000000000001',
        '11100000-0000-4000-8000-000000000001',
        'Plain product', 'plain-product-probe', 'published');

do $$
declare p public.products;
begin
  select * into p from public.products
  where id = '22200000-0000-4000-8000-000000000001';

  if p.condition <> 'new' then
    raise exception 'FAIL 1a: a listing written without a condition is %', p.condition;
  end if;
  raise notice 'ok 1a: a listing with no stated condition is new';

  if p.used_grade is not null then
    raise exception 'FAIL 1b: a new listing carries a used grade';
  end if;
  raise notice 'ok 1b: and carries no second-hand detail';
end;
$$;

-- ===================================================================
-- 2. A new listing cannot carry second-hand detail.
--
--    Without this a listing sits under New Items while saying
--    "Fair — needs repair", which is a listing that says two things
--    at once. The condition is the source of truth, so nothing may
--    contradict it.
-- ===================================================================
do $$
begin
  begin
    update public.products set used_grade = 'fair'
    where id = '22200000-0000-4000-8000-000000000001';
    raise exception 'FAIL 2a: a new listing accepted a used grade';
  exception
    when check_violation then raise notice 'ok 2a: a new listing refuses a used grade';
  end;

  begin
    update public.products set known_defects = 'scratched'
    where id = '22200000-0000-4000-8000-000000000001';
    raise exception 'FAIL 2b: a new listing accepted a defects note';
  exception
    when check_violation then raise notice 'ok 2b: and refuses a defects note';
  end;

  begin
    update public.products set age_months = 24
    where id = '22200000-0000-4000-8000-000000000001';
    raise exception 'FAIL 2c: a new listing accepted an age';
  exception
    when check_violation then raise notice 'ok 2c: and an age';
  end;

  begin
    update public.products set sale_reason = 'moving house'
    where id = '22200000-0000-4000-8000-000000000001';
    raise exception 'FAIL 2d: a new listing accepted a reason for selling';
  exception
    when check_violation then raise notice 'ok 2d: and a reason for selling';
  end;

  begin
    update public.products set condition_notes = 'a bit worn'
    where id = '22200000-0000-4000-8000-000000000001';
    raise exception 'FAIL 2e: a new listing accepted condition notes';
  exception
    when check_violation then raise notice 'ok 2e: and condition notes';
  end;
end;
$$;

-- ===================================================================
-- 3. A used listing takes all of it.
-- ===================================================================
insert into public.products
  (id, owner_id, title, slug, status, condition, used_grade,
   condition_notes, known_defects, sale_reason, age_months,
   location_city, location_area)
values ('22200000-0000-4000-8000-000000000002',
        '11100000-0000-4000-8000-000000000001',
        'Used office desk', 'used-office-desk-probe', 'published',
        'used', 'good', 'Solid, one owner', 'Scratch on the left edge',
        'Moving office', 30, 'Addis Ababa', 'Bole');

do $$
declare p public.products;
begin
  select * into p from public.products
  where id = '22200000-0000-4000-8000-000000000002';

  if p.condition <> 'used' or p.used_grade <> 'good' then
    raise exception 'FAIL 3a: stored % / %', p.condition, p.used_grade;
  end if;
  raise notice 'ok 3a: a used listing keeps its grade';

  if p.location_area <> 'Bole' then
    raise exception 'FAIL 3b: the area was not kept';
  end if;
  raise notice 'ok 3b: and an area, which is not an address';
end;
$$;

-- Moving something back to new has to clear the second-hand detail rather than
-- leave it stranded on a listing that no longer admits to it.
do $$
begin
  begin
    update public.products set condition = 'new'
    where id = '22200000-0000-4000-8000-000000000002';
    raise exception 'FAIL 3c: a used listing became new with its grade intact';
  exception
    when check_violation then
      raise notice 'ok 3c: switching back to new must clear the used detail';
  end;

  update public.products set
    condition = 'new', used_grade = null, condition_notes = null,
    known_defects = null, sale_reason = null, age_months = null
  where id = '22200000-0000-4000-8000-000000000002';
  raise notice 'ok 3d: and then it is allowed';

  update public.products set
    condition = 'used', used_grade = 'good', condition_notes = 'Solid, one owner',
    known_defects = 'Scratch on the left edge', sale_reason = 'Moving office',
    age_months = 30
  where id = '22200000-0000-4000-8000-000000000002';
end;
$$;

-- ===================================================================
-- 4. An age that is not a number of months is refused.
-- ===================================================================
do $$
begin
  begin
    update public.products set age_months = -3
    where id = '22200000-0000-4000-8000-000000000002';
    raise exception 'FAIL 4a: a negative age was accepted';
  exception
    when check_violation then raise notice 'ok 4a: a negative age is refused';
  end;

  begin
    update public.products set age_months = 5000
    where id = '22200000-0000-4000-8000-000000000002';
    raise exception 'FAIL 4b: an age of 416 years was accepted';
  exception
    when check_violation then raise notice 'ok 4b: and an implausible one';
  end;
end;
$$;

-- ===================================================================
-- 5. The sections are the condition, and nothing else.
-- ===================================================================
do $$
declare new_items integer;
declare used_items integer;
begin
  select count(*) into new_items from public.products
  where status = 'published' and condition = 'new'
    and owner_id = '11100000-0000-4000-8000-000000000001';
  select count(*) into used_items from public.products
  where status = 'published' and condition <> 'new'
    and owner_id = '11100000-0000-4000-8000-000000000001';

  if new_items <> 1 or used_items <> 1 then
    raise exception 'FAIL 5a: % new and % used, expected 1 and 1', new_items, used_items;
  end if;
  raise notice 'ok 5a: one listing in each section, from one products table';

  -- The same row, in exactly one section. A second copy is what a "leftover
  -- marketplace" would have needed.
  if exists (
    select 1 from public.products a
    join public.products b on b.slug = a.slug and b.id <> a.id
    where a.owner_id = '11100000-0000-4000-8000-000000000001'
  ) then
    raise exception 'FAIL 5b: a listing was duplicated across sections';
  end if;
  raise notice 'ok 5b: and nothing was duplicated to get there';
end;
$$;

-- ===================================================================
-- 6. A stranger cannot relabel somebody else's listing.
-- ===================================================================
set local request.jwt.claim.sub = '11100000-0000-4000-8000-000000000002';

do $$
declare touched integer;
begin
  update public.products set condition = 'new'
  where id = '22200000-0000-4000-8000-000000000002';
  get diagnostics touched = row_count;
  if touched <> 0 then
    raise exception 'FAIL 6a: a stranger moved somebody else''s listing between sections';
  end if;
  raise notice 'ok 6a: a stranger cannot move somebody else''s listing';
end;
$$;

-- ===================================================================
-- 7. The categories second-hand goods need exist, in the shared table.
-- ===================================================================
reset role;

do $$
declare missing text;
begin
  -- `needed(slug)`, not a bare `slug`. Written as `unnest(...) slug` the inner
  -- `where c.slug = slug` resolved both sides to the category table's own
  -- column — `c.slug = c.slug`, true for every row — so nothing was ever
  -- reported missing and the check passed with the categories deleted.
  select string_agg(needed.slug, ', ') into missing
  from unnest(array[
    'appliances', 'electronics', 'tools', 'machinery',
    'office', 'home', 'other',
    'furniture', 'kitchen', 'construction-materials', 'doors', 'windows'
  ]) as needed(slug)
  where not exists (
    select 1 from public.product_categories c where c.slug = needed.slug
  );

  if missing is not null then
    raise exception 'FAIL 7a: missing categories: %', missing;
  end if;
  raise notice 'ok 7a: every used-items category exists';

  -- One taxonomy, not two. A refrigerator is a refrigerator whether it is new
  -- or second-hand, and a used-only category table would mean a listing
  -- changing category when its condition changed.
  if to_regclass('public.used_item_categories') is not null then
    raise exception 'FAIL 7b: a second category table was created';
  end if;
  raise notice 'ok 7b: and there is only one category table';

  if to_regclass('public.used_products') is not null
     or to_regclass('public.used_items') is not null then
    raise exception 'FAIL 7c: a second product table was created';
  end if;
  raise notice 'ok 7c: and only one product table';
end;
$$;

-- ===================================================================
-- 8. Room to grow, without a migration.
-- ===================================================================
do $$
declare labels text;
begin
  select string_agg(enumlabel, ',' order by enumsortorder) into labels
  from pg_enum e join pg_type t on t.oid = e.enumtypid
  where t.typname = 'product_condition';

  if labels <> 'new,used,refurbished,open_box,for_parts' then
    raise exception 'FAIL 8a: conditions are %', labels;
  end if;
  raise notice 'ok 8a: refurbished, open box and for parts are already representable';

  select string_agg(enumlabel, ',' order by enumsortorder) into labels
  from pg_enum e join pg_type t on t.oid = e.enumtypid
  where t.typname = 'used_grade';

  if labels <> 'like_new,good,fair,needs_repair' then
    raise exception 'FAIL 8b: grades are %', labels;
  end if;
  raise notice 'ok 8b: the four grades the form offers';
end;
$$;

-- The section rule is "not new" rather than "is used". Written as `condition =
-- 'used'` the constraint would refuse a refurbished listing its grade, and the
-- day the form offers refurbished the whole flow would fail with a check
-- violation nobody could read. Nothing above noticed, because nothing above
-- was refurbished.
set role authenticated;
set local request.jwt.claim.sub = '11100000-0000-4000-8000-000000000001';

do $$
begin
  insert into public.products
    (id, owner_id, title, slug, status, condition, used_grade, known_defects)
  values ('22200000-0000-4000-8000-000000000003',
          '11100000-0000-4000-8000-000000000001',
          'Refurbished drill', 'refurbished-drill-probe', 'published',
          'refurbished', 'like_new', 'Replaced chuck');
  raise notice 'ok 8c: a refurbished listing may carry a grade already';
exception
  when check_violation then
    raise exception 'FAIL 8c: the constraint only admits ''used'', so refurbished cannot ship';
end;
$$;

do $$
declare in_used integer;
begin
  select count(*) into in_used from public.products
  where status = 'published' and condition <> 'new'
    and owner_id = '11100000-0000-4000-8000-000000000001';
  if in_used <> 2 then
    raise exception 'FAIL 8d: the second-hand section holds %, expected the used and the refurbished', in_used;
  end if;
  raise notice 'ok 8d: and lands in the second-hand section without a code change';
end;
$$;

rollback;
