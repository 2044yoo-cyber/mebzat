-- The creator portfolio (/projects) reads ten tables as the signed-in person,
-- `owner = me`, and leans on each table's row-level security for the rest.
-- This is that reliance, checked: the owner sees their own drafts and private
-- work; anybody else asking for the same person's rows — the same query with
-- someone else's id — sees only what is public; a visitor who is not signed
-- in sees only what is public. Nothing here adds a policy; it tests the ones
-- the page uses.

begin;

insert into auth.users (id, email) values
  ('ca000000-0000-4000-8000-000000000001', 'portfolio-owner@example.test'),
  ('ca000000-0000-4000-8000-000000000002', 'portfolio-other@example.test')
on conflict (id) do nothing;

set role authenticated;
set local request.jwt.claim.sub = 'ca000000-0000-4000-8000-000000000001';

-- One public and one not-public row in each table, as the owner makes them.
insert into public.projects (owner_id, title, slug, status) values
  (auth.uid(), 'Public villa', 'pv-public', 'published'),
  (auth.uid(), 'Draft villa', 'pv-draft', 'draft'),
  (auth.uid(), 'Private villa', 'pv-private', 'private');
insert into public.products (owner_id, title, slug, status, fulfilment) values
  (auth.uid(), 'Public wardrobe', 'pw-public', 'published', 'physical'),
  (auth.uid(), 'Draft wardrobe', 'pw-draft', 'draft', 'physical');
insert into public.products (owner_id, title, slug, status, fulfilment, digital_kind, delivery_available) values
  (auth.uid(), 'Public floor plan', 'pf-public', 'published', 'digital', 'floor_plan', false),
  (auth.uid(), 'Draft floor plan', 'pf-draft', 'draft', 'digital', 'floor_plan', false);
insert into public.properties (owner_id, title, slug, property_type, latitude, longitude, status) values
  (auth.uid(), 'Public flat', 'pp-public', 'apartment', 9.01, 38.76, 'available'),
  (auth.uid(), 'Draft flat', 'pp-draft', 'apartment', 9.01, 38.76, 'draft');
insert into public.equipment (owner_id, title, slug, category, status, daily_rate) values
  (auth.uid(), 'Public mixer', 'pe-public', 'concrete', 'published', 1500),
  (auth.uid(), 'Draft mixer', 'pe-draft', 'concrete', 'draft', 1500);
insert into public.services (provider_id, title, slug, status) values
  (auth.uid(), 'Public joinery', 'ps-public', 'published'),
  (auth.uid(), 'Draft joinery', 'ps-draft', 'draft');
insert into public.designs (owner_id, title, slug, kind, spec, visibility, published_at) values
  (auth.uid(), 'Public cabinet', 'pd-public', 'cabinet', '{}', 'public', now()),
  (auth.uid(), 'Unlisted cabinet', 'pd-unlisted', 'cabinet', '{}', 'unlisted', now()),
  (auth.uid(), 'Private cabinet', 'pd-private', 'cabinet', '{}', 'private', null);
insert into public.tours (owner_id, title, visibility, published_at) values
  (auth.uid(), 'Public tour', 'published', now());
insert into public.tours (owner_id, title, visibility) values
  (auth.uid(), 'Unlisted tour', 'unlisted'),
  (auth.uid(), 'Draft tour', 'draft'),
  (auth.uid(), 'Private tour', 'private');
insert into public.posts (author_id, title, body, status) values
  (auth.uid(), 'Public post', 'Hello', 'published'),
  (auth.uid(), 'Hidden post', 'Hidden', 'hidden');
insert into public.jobs (poster_id, title, slug, description, status, visibility) values
  (auth.uid(), 'Public job', 'pj-public', 'Hiring', 'open', 'public'),
  (auth.uid(), 'Draft job', 'pj-draft', 'Hiring', 'draft', 'public'),
  (auth.uid(), 'Private job', 'pj-private', 'Hiring', 'open', 'private');
insert into public.invest_projects (owner_id, title, slug, location, funding_goal, published) values
  (auth.uid(), 'Public fund', 'pi-public', 'Addis Ababa', 1000, true),
  (auth.uid(), 'Draft fund', 'pi-draft', 'Addis Ababa', 1000, false);

reset role;
create temporary table portfolio_seen (who text, tbl text, title text);
grant all on portfolio_seen to authenticated, anon;

-- What each person gets from the page's own queries, for this owner.
create or replace function pg_temp.read_as(who text) returns void language plpgsql as $$
declare owner uuid := 'ca000000-0000-4000-8000-000000000001';
begin
  insert into portfolio_seen select who, 'projects', title from public.projects where owner_id = owner;
  insert into portfolio_seen select who, 'products', title from public.products where owner_id = owner and fulfilment <> 'digital';
  insert into portfolio_seen select who, 'digital', title from public.products where owner_id = owner and fulfilment = 'digital';
  insert into portfolio_seen select who, 'properties', title from public.properties where owner_id = owner;
  insert into portfolio_seen select who, 'equipment', title from public.equipment where owner_id = owner;
  insert into portfolio_seen select who, 'services', title from public.services where provider_id = owner;
  insert into portfolio_seen select who, 'designs', title from public.designs where owner_id = owner;
  insert into portfolio_seen select who, 'tours', title from public.tours where owner_id = owner;
  insert into portfolio_seen select who, 'posts', title from public.posts where author_id = owner;
  insert into portfolio_seen select who, 'jobs', title from public.jobs where poster_id = owner;
  insert into portfolio_seen select who, 'invest', title from public.invest_projects where owner_id = owner;
end $$;

set role authenticated;
set local request.jwt.claim.sub = 'ca000000-0000-4000-8000-000000000001';
select pg_temp.read_as('owner');
set local request.jwt.claim.sub = 'ca000000-0000-4000-8000-000000000002';
select pg_temp.read_as('other');
reset role;
set role anon;
set local request.jwt.claim.sub = '';
select pg_temp.read_as('anon');
reset role;

do $$
declare
  hidden_titles text[] := array['Draft villa', 'Private villa', 'Draft wardrobe', 'Draft floor plan', 'Draft flat', 'Draft mixer',
    'Draft joinery', 'Private cabinet', 'Draft tour', 'Private tour', 'Hidden post', 'Draft job', 'Private job', 'Draft fund'];
  public_titles text[] := array['Public villa', 'Public wardrobe', 'Public floor plan', 'Public flat', 'Public mixer', 'Public joinery',
    'Public cabinet', 'Public tour', 'Public post', 'Public job', 'Public fund'];
  missing text;
begin
  -- 1. The owner sees all of it, drafts and private work included.
  select string_agg(t, ', ') into missing from unnest(hidden_titles || public_titles) t
  where not exists (select 1 from portfolio_seen where who = 'owner' and title = t);
  if missing is not null then raise exception 'FAIL 1: the owner does not see their own %', missing; end if;
  if not exists (select 1 from portfolio_seen where who = 'owner' and title = 'Unlisted cabinet')
     or not exists (select 1 from portfolio_seen where who = 'owner' and title = 'Unlisted tour') then
    raise exception 'FAIL 1: the owner does not see their unlisted work';
  end if;
  raise notice 'ok 1: the owner sees all 28 of their rows, drafts, private and unlisted ones included';

  -- 2. Nobody else sees what is not public — not by asking for the owner's rows by id.
  select string_agg(distinct who || ': ' || title, ', ') into missing from portfolio_seen
  where who <> 'owner' and title = any (hidden_titles);
  if missing is not null then raise exception 'FAIL 2: somebody else sees %', missing; end if;
  raise notice 'ok 2: another signed-in person and a visitor see none of the drafts, private or hidden work';

  -- 2b. "Unlisted" designs and tours are, by their tables' own rules, readable
  --     by anybody — that is what makes a share link work — and therefore by
  --     anybody who asks for a person's rows. Existing behaviour, recorded so a
  --     change to it is noticed: the portfolio shows a person only their own
  --     rows, so it never lists somebody's unlisted work to anybody else.
  if not exists (select 1 from portfolio_seen where who = 'other' and title = 'Unlisted cabinet')
     or not exists (select 1 from portfolio_seen where who = 'other' and title = 'Unlisted tour') then
    raise exception 'FAIL 2b: unlisted work changed meaning — re-check how the portfolio and profile pages use it';
  end if;
  raise notice 'ok 2b: unlisted designs and tours stay readable by link, as their tables intend';

  -- 3. And the public work is public — to another signed-in person at least.
  select string_agg(t, ', ') into missing from unnest(public_titles) t
  where not exists (select 1 from portfolio_seen where who = 'other' and title = t);
  if missing is not null then raise exception 'FAIL 3: public work is not visible to others: %', missing; end if;
  raise notice 'ok 3: everything published is visible to others';

  -- 4. Digital and physical products are told apart by the column the page filters on.
  if exists (select 1 from portfolio_seen where tbl = 'products' and title like '%floor plan%')
     or exists (select 1 from portfolio_seen where tbl = 'digital' and title like '%wardrobe%') then
    raise exception 'FAIL 4: digital products and other listings are mixed up';
  end if;
  raise notice 'ok 4: a digital file is never also a marketplace listing, and the reverse';
end
$$;

rollback;
