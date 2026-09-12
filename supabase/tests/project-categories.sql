-- A project is whatever kind of work it says it is, its category-specific
-- answers live in one bounded bag, and the three unpublished states are all
-- owner-only.
--
-- Run after applying 0077. Prints one line per check and rolls itself back.
-- Run as `authenticated`, not as a superuser: projects has policies, and a
-- superuser run would report that anybody can read anybody's drafts.

begin;

insert into auth.users (id, email) values
  ('33300000-0000-4000-8000-000000000001', 'owner@example.test'),
  ('33300000-0000-4000-8000-000000000002', 'stranger@example.test')
on conflict (id) do nothing;

insert into public.profiles (id, username) values
  ('33300000-0000-4000-8000-000000000001', 'probe_owner'),
  ('33300000-0000-4000-8000-000000000002', 'probe_stranger')
on conflict (id) do update set username = excluded.username;

-- ===================================================================
-- 1. A project written the old way is still a building project.
--
--    0004's form had no category. Every row it wrote is a building
--    project and must stay one, with its bedrooms and floors intact —
--    the whole point of adding a category rather than replacing the
--    table.
-- ===================================================================
set role authenticated;
set local request.jwt.claim.sub = '33300000-0000-4000-8000-000000000001';

insert into public.projects (id, owner_id, title, slug, bedrooms, floors, building_type)
values ('44400000-0000-4000-8000-000000000001',
        '33300000-0000-4000-8000-000000000001',
        'Lakeside Villa', 'lakeside-villa-probe', 4, 2, 'residential');

do $$
declare p public.projects;
begin
  select * into p from public.projects
  where id = '44400000-0000-4000-8000-000000000001';

  if p.category <> 'building_construction' then
    raise exception 'FAIL 1a: a project written without a category is %', p.category;
  end if;
  raise notice 'ok 1a: a project with no stated category is a building project';

  if p.bedrooms <> 4 or p.floors <> 2 then
    raise exception 'FAIL 1b: bedrooms/floors did not survive (% / %)', p.bedrooms, p.floors;
  end if;
  raise notice 'ok 1b: and keeps the building fields it was written with';

  if p.metadata <> '{}'::jsonb then
    raise exception 'FAIL 1c: metadata defaulted to %', p.metadata;
  end if;
  raise notice 'ok 1c: with an empty bag of category fields';

  if p.tags <> '{}'::text[] then
    raise exception 'FAIL 1d: tags defaulted to %', p.tags;
  end if;
  raise notice 'ok 1d: and no tags';
end;
$$;

-- ===================================================================
-- 2. Every category in the brief exists.
--
--    A category the form offers but the type refuses is a form that
--    throws on submit. Named one by one rather than counted, because a
--    count passes when a name is wrong.
-- ===================================================================
do $$
declare
  wanted text[] := array[
    'building_construction', 'architecture', 'interior_design', 'kitchen',
    'furniture', 'wardrobe', 'joinery', 'renovation', 'finishing',
    'electrical', 'plumbing', 'landscaping', 'construction_product', 'other'
  ];
  got text[];
  missing text[];
begin
  select array_agg(enumlabel::text order by enumsortorder) into got
  from pg_enum where enumtypid = 'public.project_category'::regtype;

  select array_agg(w) into missing
  from unnest(wanted) w where not (w = any (got));

  if missing is not null then
    raise exception 'FAIL 2a: project_category is missing %', missing;
  end if;
  raise notice 'ok 2a: all 14 categories in the brief exist';
end;
$$;

-- ===================================================================
-- 3. A kitchen is a kitchen, and its answers go in the bag.
--
--    The point of the whole change: a kitchen project carries a
--    countertop material without the table growing a countertop column,
--    and carries no bedrooms.
-- ===================================================================
insert into public.projects (id, owner_id, title, slug, category, metadata)
values ('44400000-0000-4000-8000-000000000002',
        '33300000-0000-4000-8000-000000000001',
        'Bole Kitchen', 'bole-kitchen-probe', 'kitchen',
        '{"kitchen_type": "l_shaped", "countertop": "Granite", "material": "MDF"}'::jsonb);

do $$
declare p public.projects;
begin
  select * into p from public.projects
  where id = '44400000-0000-4000-8000-000000000002';

  if p.category <> 'kitchen' then
    raise exception 'FAIL 3a: category is %', p.category;
  end if;
  raise notice 'ok 3a: a kitchen project is a kitchen project';

  if p.metadata ->> 'kitchen_type' <> 'l_shaped' then
    raise exception 'FAIL 3b: kitchen_type came back as %', p.metadata ->> 'kitchen_type';
  end if;
  raise notice 'ok 3b: and its kitchen answers survive the round trip';

  if p.bedrooms is not null or p.floors is not null then
    raise exception 'FAIL 3c: a kitchen was given bedrooms/floors';
  end if;
  raise notice 'ok 3c: and has no bedrooms and no floors';
end;
$$;

-- ===================================================================
-- 4. The bag has a shape and a ceiling.
--
--    Without the object check, `metadata` accepts a bare string or an
--    array and every reader that does `metadata ->> 'x'` gets null
--    instead of an error. Without the size check, one form post is a
--    way to write a megabyte into somebody's row.
-- ===================================================================
do $$
begin
  begin
    update public.projects set metadata = '"not an object"'::jsonb
    where id = '44400000-0000-4000-8000-000000000002';
    raise exception 'FAIL 4a: metadata accepted a bare string';
  exception
    when check_violation then raise notice 'ok 4a: metadata refuses anything but an object';
  end;

  begin
    update public.projects set metadata = '[1,2,3]'::jsonb
    where id = '44400000-0000-4000-8000-000000000002';
    raise exception 'FAIL 4b: metadata accepted an array';
  exception
    when check_violation then raise notice 'ok 4b: including an array';
  end;

  begin
    update public.projects
    set metadata = jsonb_build_object('blob', repeat('x', 20000))
    where id = '44400000-0000-4000-8000-000000000002';
    raise exception 'FAIL 4c: metadata accepted 20KB';
  exception
    when check_violation then raise notice 'ok 4c: and refuses an oversized bag';
  end;
end;
$$;

-- ===================================================================
-- 5. Tags are bounded.
-- ===================================================================
do $$
begin
  update public.projects set tags = array['joinery', 'mdf', 'spray finish']
  where id = '44400000-0000-4000-8000-000000000002';
  raise notice 'ok 5a: a project takes a handful of tags';

  begin
    update public.projects
    set tags = (select array_agg('tag' || i) from generate_series(1, 25) i)
    where id = '44400000-0000-4000-8000-000000000002';
    raise exception 'FAIL 5b: accepted 25 tags';
  exception
    when check_violation then raise notice 'ok 5b: and refuses two dozen of them';
  end;

  begin
    update public.projects set tags = array['ok', '']
    where id = '44400000-0000-4000-8000-000000000002';
    raise exception 'FAIL 5c: accepted an empty tag';
  exception
    when check_violation then raise notice 'ok 5c: and refuses a blank one';
  end;

  begin
    update public.projects set tags = array[repeat('x', 900)]
    where id = '44400000-0000-4000-8000-000000000002';
    raise exception 'FAIL 5d: accepted a 900-character tag';
  exception
    when check_violation then raise notice 'ok 5d: and refuses a paragraph as a tag';
  end;
end;
$$;

-- ===================================================================
-- 6. Private and archived exist, and neither is public.
--
--    This is the check that matters for the new states: 0004's select
--    policy keys on `status = 'published'`, so adding labels to the
--    enum is supposed to make them owner-only for free. Supposed to is
--    not the same as does.
-- ===================================================================
insert into public.projects (id, owner_id, title, slug, category, status)
values
  ('44400000-0000-4000-8000-000000000003',
   '33300000-0000-4000-8000-000000000001',
   'Private wardrobe', 'private-wardrobe-probe', 'wardrobe', 'private'),
  ('44400000-0000-4000-8000-000000000004',
   '33300000-0000-4000-8000-000000000001',
   'Archived shopfront', 'archived-shopfront-probe', 'joinery', 'archived'),
  ('44400000-0000-4000-8000-000000000005',
   '33300000-0000-4000-8000-000000000001',
   'Published bookcase', 'published-bookcase-probe', 'furniture', 'published'),
  -- Explicitly a draft. The first project in this file is not one: 0004
  -- declares `status ... default 'published'`, so a row inserted without a
  -- status is public, and asserting the draft rule against it asserted
  -- nothing.
  ('44400000-0000-4000-8000-000000000006',
   '33300000-0000-4000-8000-000000000001',
   'Draft villa', 'draft-villa-probe', 'architecture', 'draft');

do $$
declare n integer;
begin
  select count(*) into n from public.projects
  where id in ('44400000-0000-4000-8000-000000000003',
               '44400000-0000-4000-8000-000000000004',
               '44400000-0000-4000-8000-000000000006');
  if n <> 3 then
    raise exception 'FAIL 6a: the owner sees % of their own 3 hidden projects', n;
  end if;
  raise notice 'ok 6a: the owner sees their own draft, private and archived projects';
end;
$$;

-- Now as somebody else.
set local request.jwt.claim.sub = '33300000-0000-4000-8000-000000000002';

do $$
declare n integer;
begin
  select count(*) into n from public.projects
  where id = '44400000-0000-4000-8000-000000000003';
  if n <> 0 then
    raise exception 'FAIL 6b: a stranger can read a private project';
  end if;
  raise notice 'ok 6b: a stranger cannot read a private project';

  select count(*) into n from public.projects
  where id = '44400000-0000-4000-8000-000000000004';
  if n <> 0 then
    raise exception 'FAIL 6c: a stranger can read an archived project';
  end if;
  raise notice 'ok 6c: nor an archived one';

  select count(*) into n from public.projects
  where id = '44400000-0000-4000-8000-000000000006';
  if n <> 0 then
    raise exception 'FAIL 6d: a stranger can read a draft project';
  end if;
  raise notice 'ok 6d: nor a draft';

  select count(*) into n from public.projects
  where id = '44400000-0000-4000-8000-000000000005';
  if n <> 1 then
    raise exception 'FAIL 6e: a stranger cannot read a PUBLISHED project';
  end if;
  raise notice 'ok 6e: and can still read a published one';
end;
$$;

-- ===================================================================
-- 7. A stranger cannot change somebody else's category.
-- ===================================================================
do $$
declare n integer;
begin
  update public.projects set category = 'other'
  where id = '44400000-0000-4000-8000-000000000005';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FAIL 7a: a stranger recategorised somebody else''s project';
  end if;
  raise notice 'ok 7a: a stranger cannot recategorise somebody else''s project';
end;
$$;

rollback;
