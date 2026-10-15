-- The Home feed: mixed, personal, and different from one visit to the next.
--
-- ## Why it stopped changing
--
-- Run on a copy of the seeded database, as a signed-in reader, recording the
-- cards they were shown the way the app does (`feed_record_views`):
--
--   visit 1: 13 of 24 property listings, 9 kinds of content
--   visit 2: 24 of 24 property listings, 1 kind
--   visit 3: 24 of 24 property listings, 1 kind   … and so on
--
-- `feed_page_personalized` (0101) counted every card *shown* as interest in
-- its kind — `least(seen_count, 3)` per view, in `raw_interest`. Seven in ten
-- published posts are property listings (the property adapters sync every
-- listing), so the first page is mostly properties; scrolling past them is
-- recorded as wanting properties; the next page is more properties. Within
-- two visits the feed is one kind, and with every listing scoring alike it
-- reads as the same feed. Nothing limited how much of one kind could rank,
-- only how much of one author.
--
-- It was also unsteady while scrolling: a card seen on page one had its
-- score changed before page two was asked for, so it moved across the
-- cursor and came back, and the page that should have been new was mostly
-- repeats.
--
-- ## What this does
--
--   * `feed_page_mixed`: interest comes from deliberate acts only — likes,
--     saves, follows, opens, contacts, the topics a person chose — and is a
--     share, capped, so it leans the feed without taking it over. Seeing a
--     card makes it less likely to be shown again, never more of its kind.
--     A kind, an author and a repeated title each pay a growing penalty, so
--     the feed interleaves. Everything that moves while somebody scrolls is
--     read as it stood when they started (the cursor's `now`), so pages do
--     not overlap; posts published since wait for the next visit.
--   * More of Medosha reaches it, through the same adapter 0101 uses (one
--     post per source row, the source row stays canonical): services, open
--     public jobs, equipment for hire, community posts, investment projects,
--     and public Berchuma designs. Digital products are filed as files
--     (floor plans, documents), not as equipment.
--   * Making something private, a draft, or withdrawn takes its post out of
--     the feed — including designs and tours, which had no such rule.
--   * An author can no longer set the numbers the ranking reads off their own
--     post (boost, like/view/save counts, publication time) or give it a
--     verified badge: through the API those columns are the system's.
--   * `feed_interests`: the topics a person chose, and whether their own
--     activity, role and city may lean the feed at all. Read only by them.
--
-- `feed_page_personalized` stays as it was, for a deployment running the old
-- code. Safe to run more than once.

begin;

-- ---------------------------------------------------------------------------
-- 1. What an author may write on their own post
-- ---------------------------------------------------------------------------

-- Security invoker on purpose: `current_user` is then whoever is writing. A
-- person through the API is `authenticated`; the counters, adapters and
-- moderation are security-definer functions, and are not.
create or replace function public.feed_posts_author_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  verified boolean;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  select pr.verification_status = 'verified' into verified
  from public.profiles pr where pr.id = new.author_id;
  new.author_verified := coalesce(verified, false);

  if tg_op = 'INSERT' then
    new.boost := 0;
    new.like_count := 0;
    new.comment_count := 0;
    new.save_count := 0;
    new.share_count := 0;
    new.view_count := 0;
    new.download_count := 0;
    new.is_demo := false;
    new.published_at := least(coalesce(new.published_at, now()), now());
    new.created_at := now();
    -- A post is its author's, or their company's; never somebody else's key.
    if new.author_key is distinct from 'profile:' || new.author_id
       and not (new.company_id is not null and new.author_key = 'company:' || new.company_id) then
      new.author_key := 'profile:' || new.author_id;
    end if;
    return new;
  end if;

  new.boost := old.boost;
  new.like_count := old.like_count;
  new.comment_count := old.comment_count;
  new.save_count := old.save_count;
  new.share_count := old.share_count;
  new.view_count := old.view_count;
  new.download_count := old.download_count;
  new.is_demo := old.is_demo;
  new.published_at := old.published_at;
  new.created_at := old.created_at;
  new.author_key := old.author_key;
  -- Taken down by moderation stays down.
  if old.status = 'removed' then
    new.status := 'removed';
  end if;
  return new;
end;
$$;

drop trigger if exists feed_posts_author_guard on public.feed_posts;
create trigger feed_posts_author_guard
  before insert or update on public.feed_posts
  for each row execute function public.feed_posts_author_guard();

-- ---------------------------------------------------------------------------
-- 2. Topics a person chose
-- ---------------------------------------------------------------------------

create table if not exists public.feed_interests (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  topics public.feed_topic[] not null default '{}',
  -- Off: the feed leans only on what they chose and who they follow, not on
  -- what they have liked, saved or opened, nor on their role or city.
  personalised boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint feed_interests_bounded check (cardinality(topics) <= 8)
);

comment on table public.feed_interests is
  'The feed topics a person asked to see more of, and whether their activity may lean it. Theirs alone: nobody else reads it.';

alter table public.feed_interests enable row level security;
drop policy if exists "feed interests: own" on public.feed_interests;
create policy "feed interests: own" on public.feed_interests
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
revoke all on public.feed_interests from anon, public;
grant select, insert, update, delete on public.feed_interests to authenticated;

-- The ranking runs as whoever is reading, a visitor included, and a visitor
-- may not read this table at all. This answers for the reader alone — their
-- own row, or nothing — so the ranking can ask without the table being opened
-- to anybody.
create or replace function public.feed_viewer_preferences()
returns table (topics public.feed_topic[], personalised boolean)
language sql stable security definer set search_path = public as $$
  select i.topics, i.personalised from public.feed_interests i where i.user_id = auth.uid()
$$;
revoke execute on function public.feed_viewer_preferences() from public;
grant execute on function public.feed_viewer_preferences() to anon, authenticated;

-- When an interaction was first recorded. `last_interacted_at` moves on every
-- repeat, so a ranking that read it to ask "did this happen before the
-- reading began?" would drop the row the moment it was repeated mid-scroll,
-- and every score that leaned on it would move under the cursor.
alter table public.feed_interactions add column if not exists first_interacted_at timestamptz;
update public.feed_interactions set first_interacted_at = last_interacted_at where first_interacted_at is null;
alter table public.feed_interactions alter column first_interacted_at set default now();
alter table public.feed_interactions alter column first_interacted_at set not null;

-- When a card had last been seen before the reading that is now showing it.
-- A sighting moves `last_seen_at` to now; the reading in progress ranked the
-- card by the value before that, and still needs it, or the card's score
-- changes under the cursor.
alter table public.feed_views add column if not exists previous_seen_at timestamptz;

-- Recording a sighting. `p_session` is the clock of the reading it happened
-- in (the cursor's `now`).
--
-- Security definer, unlike 0065's: the view count is a column of somebody
-- else's post, which the reader's own role may not and — since the guard
-- above — cannot write. It counts each reader once, on their first sighting,
-- so calling it again and again does not inflate anybody's numbers.
create or replace function public.feed_record_views(p_posts uuid[], p_session timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or p_posts is null or cardinality(p_posts) = 0 then
    return;
  end if;

  with wanted as (
    select distinct p.id from public.feed_posts p
    where p.id = any (p_posts[1:100]) and p.status = 'published'
  ),
  upserted as (
    insert into public.feed_views (post_id, user_id, first_seen_at, last_seen_at)
    select w.id, uid, now(), now() from wanted w
    on conflict (post_id, user_id) do update
      set seen_count = public.feed_views.seen_count + 1,
          previous_seen_at = case
            when public.feed_views.last_seen_at <= coalesce(p_session, now()) then public.feed_views.last_seen_at
            else public.feed_views.previous_seen_at end,
          last_seen_at = now()
    returning post_id, (xmax = 0) as inserted
  )
  update public.feed_posts f set view_count = f.view_count + 1
  from upserted u where f.id = u.post_id and u.inserted;
end;
$$;
revoke execute on function public.feed_record_views(uuid[], timestamptz) from public, anon;
grant execute on function public.feed_record_views(uuid[], timestamptz) to authenticated;

-- The one-argument form, for a client deployed before this: the same, with
-- the reading taken to have begun now.
create or replace function public.feed_record_views(p_posts uuid[])
returns void
language sql
security invoker
set search_path = public
as $$ select public.feed_record_views(p_posts, null::timestamptz) $$;
grant execute on function public.feed_record_views(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. More of Medosha, through 0101's adapter
-- ---------------------------------------------------------------------------

-- One post per source row, as for the four 0101 adapts. Any duplicate a
-- hand-written insert left behind is kept, renamed out of the way.
update public.feed_posts p set entity_type = p.entity_type || ':duplicate', status = 'hidden'
where p.entity_type in ('service', 'job', 'equipment', 'community_post', 'invest')
  and exists (
    select 1 from public.feed_posts q
    where q.entity_type = p.entity_type and q.entity_id = p.entity_id
      and (q.created_at, q.id) < (p.created_at, p.id)
  );
create unique index if not exists feed_posts_source_once_more
  on public.feed_posts (entity_type, entity_id)
  where entity_type in ('service', 'job', 'equipment', 'community_post', 'invest');

-- Each adapter dates a post from the moment it reaches the feed (`now()`,
-- which `feed_upsert_source` uses only when it creates the post): a listing
-- drafted last month and published today is new today. The backfills further
-- down use each row's own `created_at` instead, so running this does not make
-- everything already on Medosha look brand new at once.

-- Services: a published offer.
create or replace function public.feed_sync_service() returns trigger
language plpgsql security definer set search_path = public as $$ begin
  perform public.feed_upsert_source('service', new.id, new.status::text = 'published',
    'professional', 'construction', new.provider_id, new.company_id, new.title, new.description,
    '/services/' || new.id, 'View service', new.price_from, new.currency, new.unit,
    new.location_city, new.location_country,
    array_remove(array['service', new.subcategory], null), new.cover_image_url, now());
  return new; end $$;
drop trigger if exists services_feed_sync on public.services;
create trigger services_feed_sync after insert or update on public.services
  for each row execute function public.feed_sync_service();

-- Jobs: open, and public.
create or replace function public.feed_sync_job() returns trigger
language plpgsql security definer set search_path = public as $$ begin
  perform public.feed_upsert_source('job', new.id,
    new.status::text = 'open' and new.visibility::text = 'public',
    'professional', 'community', new.poster_id, new.company_id, new.title, new.description,
    '/jobs/' || new.id, 'View job', case when new.salary_visible then new.salary_max else null end,
    new.currency, new.salary_period::text, new.location_city, new.location_country,
    array_remove(array['job', new.job_type::text, new.profession], null), null, now());
  return new; end $$;
drop trigger if exists jobs_feed_sync on public.jobs;
create trigger jobs_feed_sync after insert or update on public.jobs
  for each row execute function public.feed_sync_job();

-- Equipment for hire: published and available.
create or replace function public.feed_sync_equipment() returns trigger
language plpgsql security definer set search_path = public as $$ begin
  perform public.feed_upsert_source('equipment', new.id,
    new.status::text = 'published' and new.available,
    'equipment', 'equipment', new.owner_id, new.company_id, new.title, new.description,
    '/equipment/' || new.id, 'View equipment', new.daily_rate, new.currency, 'day',
    new.location_city, new.location_country,
    array_remove(array['equipment', 'hire', new.category], null), new.cover_image_url, now());
  return new; end $$;
drop trigger if exists equipment_feed_sync on public.equipment;
create trigger equipment_feed_sync after insert or update on public.equipment
  for each row execute function public.feed_sync_equipment();

-- Community posts: published ones, as discussions, questions, tips, showcases.
create or replace function public.feed_sync_community_post() returns trigger
language plpgsql security definer set search_path = public as $$ begin
  perform public.feed_upsert_source('community_post', new.id, new.status::text = 'published',
    (case new.kind::text when 'question' then 'question' when 'tip' then 'cost_tip'
       when 'showcase' then 'success_story' else 'discussion' end)::public.feed_kind,
    'community', new.author_id, new.company_id,
    coalesce(nullif(btrim(new.title), ''), left(new.body, 120)), new.body,
    '/community/' || new.id, 'Join the discussion', null, null, null, null, null,
    array['community', new.kind::text], null, now());
  return new; end $$;
drop trigger if exists posts_feed_sync on public.posts;
create trigger posts_feed_sync after insert or update on public.posts
  for each row execute function public.feed_sync_community_post();

-- Investment projects: published, with an owner to answer for them.
create or replace function public.feed_sync_invest() returns trigger
language plpgsql security definer set search_path = public as $$ begin
  if new.owner_id is null then return new; end if;
  perform public.feed_upsert_source('invest', new.id, new.published,
    'investment', 'finance', new.owner_id, null, new.title, coalesce(new.summary, new.description),
    '/invest/' || new.slug, 'View investment', new.funding_goal, new.currency, 'goal',
    new.city, null, array['investment', new.stage::text], new.hero_image_url, now());
  return new; end $$;
drop trigger if exists invest_projects_feed_sync on public.invest_projects;
create trigger invest_projects_feed_sync after insert or update on public.invest_projects
  for each row execute function public.feed_sync_invest();

-- Deleting any of them hides its post, as 0101 does for its four.
create or replace function public.feed_hide_deleted_source_more() returns trigger
language plpgsql security definer set search_path = public as $$
declare source_type text := case tg_table_name
  when 'services' then 'service' when 'jobs' then 'job' when 'equipment' then 'equipment'
  when 'posts' then 'community_post' when 'invest_projects' then 'invest'
  when 'designs' then 'design' when 'tours' then 'tour' end;
begin
  update public.feed_posts set status = 'hidden', updated_at = now()
  where entity_type = source_type and entity_id = old.id;
  return old;
end $$;
do $$
declare t text;
begin
  foreach t in array array['services', 'jobs', 'equipment', 'posts', 'invest_projects', 'designs', 'tours'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_feed_delete_more', t);
    execute format('create trigger %I after delete on public.%I for each row execute function public.feed_hide_deleted_source_more()', t || '_feed_delete_more', t);
  end loop;
end $$;

-- Products: a digital file is a file — a floor plan, a drawing, a model, a
-- BOQ — not "equipment", which is where 0101 filed everything it did not
-- recognise.
create or replace function public.feed_sync_product() returns trigger
language plpgsql security definer set search_path=public as $$
declare category text; k public.feed_kind; t public.feed_topic; digital boolean; begin
  select slug into category from public.product_categories where id=new.category_id;
  digital := new.fulfilment::text = 'digital';
  k := case when digital and new.digital_kind::text = 'floor_plan' then 'floor_plan'::public.feed_kind
            when digital then 'document'::public.feed_kind
            when category='furniture' then 'furniture'::public.feed_kind
            when category='construction-materials' then 'material'::public.feed_kind
            else 'equipment'::public.feed_kind end;
  t := case when digital or category in ('furniture','kitchen','bathroom','lighting') then 'design'::public.feed_topic
            else 'materials'::public.feed_topic end;
  perform public.feed_upsert_source('product',new.id,new.status::text='published',k,t,
    new.owner_id,null,new.title,new.description,'/marketplace/'||new.id,
    case when digital then 'View file' else 'View product' end,
    new.price,new.currency,new.unit,new.location_city,new.location_country,
    array_remove(array[category,new.brand,'marketplace',
      case when digital then 'digital' end, case when digital then new.digital_kind::text end],null),
    new.cover_image_url,now());
  return new; end $$;

-- Designs from Berchuma Studio: public and published ones are discoverable;
-- private or unlisted ones are not, whatever was shared before.
create or replace function public.feed_sync_design() returns trigger
language plpgsql security definer set search_path = public as $$ begin
  perform public.feed_upsert_source('design', new.id,
    new.visibility::text = 'public' and new.published_at is not null,
    'ai_design', 'design', new.owner_id, new.company_id, new.title, new.prompt,
    '/designs/' || new.slug, 'Open the design', new.estimated_cost, new.currency, 'estimated',
    null, null, array[replace(new.kind, '_', ' '), 'berchuma'], new.cover_url, coalesce(new.published_at, new.created_at));
  return new; end $$;
drop trigger if exists designs_feed_sync on public.designs;
create trigger designs_feed_sync after insert or update of visibility, published_at, title, cover_url, prompt on public.designs
  for each row execute function public.feed_sync_design();

-- Tours stay opt-in (share_to_feed, in the app); this only makes sure one
-- that stops being published leaves the feed.
create or replace function public.feed_hide_unpublished_tour() returns trigger
language plpgsql security definer set search_path = public as $$ begin
  if new.visibility::text <> 'published' then
    update public.feed_posts set status = 'hidden', updated_at = now()
    where entity_type = 'tour' and entity_id = new.id and status = 'published';
  end if;
  return new; end $$;
drop trigger if exists tours_feed_privacy on public.tours;
create trigger tours_feed_privacy after update of visibility on public.tours
  for each row execute function public.feed_hide_unpublished_tour();

revoke execute on function public.feed_sync_service() from public, anon, authenticated;
revoke execute on function public.feed_sync_job() from public, anon, authenticated;
revoke execute on function public.feed_sync_equipment() from public, anon, authenticated;
revoke execute on function public.feed_sync_community_post() from public, anon, authenticated;
revoke execute on function public.feed_sync_invest() from public, anon, authenticated;
revoke execute on function public.feed_sync_design() from public, anon, authenticated;
revoke execute on function public.feed_hide_unpublished_tour() from public, anon, authenticated;
revoke execute on function public.feed_hide_deleted_source_more() from public, anon, authenticated;

-- Backfill, through the same adapters. Rows that are not public only hide a
-- post that exists; they create nothing.
select public.feed_upsert_source('service', s.id, s.status::text = 'published', 'professional', 'construction',
  s.provider_id, s.company_id, s.title, s.description, '/services/' || s.id, 'View service', s.price_from, s.currency,
  s.unit, s.location_city, s.location_country, array_remove(array['service', s.subcategory], null), s.cover_image_url, s.created_at)
from public.services s;
select public.feed_upsert_source('job', j.id, j.status::text = 'open' and j.visibility::text = 'public', 'professional',
  'community', j.poster_id, j.company_id, j.title, j.description, '/jobs/' || j.id, 'View job',
  case when j.salary_visible then j.salary_max else null end, j.currency, j.salary_period::text,
  j.location_city, j.location_country, array_remove(array['job', j.job_type::text, j.profession], null), null, j.created_at)
from public.jobs j;
select public.feed_upsert_source('equipment', e.id, e.status::text = 'published' and e.available, 'equipment', 'equipment',
  e.owner_id, e.company_id, e.title, e.description, '/equipment/' || e.id, 'View equipment', e.daily_rate, e.currency, 'day',
  e.location_city, e.location_country, array_remove(array['equipment', 'hire', e.category], null), e.cover_image_url, e.created_at)
from public.equipment e;
select public.feed_upsert_source('community_post', c.id, c.status::text = 'published',
  (case c.kind::text when 'question' then 'question' when 'tip' then 'cost_tip' when 'showcase' then 'success_story' else 'discussion' end)::public.feed_kind,
  'community', c.author_id, c.company_id, coalesce(nullif(btrim(c.title), ''), left(c.body, 120)), c.body,
  '/community/' || c.id, 'Join the discussion', null, null, null, null, null, array['community', c.kind::text], null, c.created_at)
from public.posts c;
select public.feed_upsert_source('invest', i.id, i.published, 'investment', 'finance', i.owner_id, null, i.title,
  coalesce(i.summary, i.description), '/invest/' || i.slug, 'View investment', i.funding_goal, i.currency, 'goal',
  i.city, null, array['investment', i.stage::text], i.hero_image_url, i.created_at)
from public.invest_projects i where i.owner_id is not null;
select public.feed_upsert_source('design', d.id, d.visibility::text = 'public' and d.published_at is not null,
  'ai_design', 'design', d.owner_id, d.company_id, d.title, d.prompt, '/designs/' || d.slug, 'Open the design',
  d.estimated_cost, d.currency, 'estimated', null, null, array[replace(d.kind, '_', ' '), 'berchuma'], d.cover_url,
  coalesce(d.published_at, d.created_at))
from public.designs d;
update public.feed_posts f set status = 'hidden', updated_at = now()
from public.tours t
where f.entity_type = 'tour' and f.entity_id = t.id and f.status = 'published' and t.visibility::text <> 'published';
-- Digital products, refiled.
select public.feed_upsert_source('product', p.id, p.status::text = 'published',
  case when p.digital_kind::text = 'floor_plan' then 'floor_plan'::public.feed_kind else 'document'::public.feed_kind end,
  'design', p.owner_id, null, p.title, p.description, '/marketplace/' || p.id, 'View file', p.price, p.currency, p.unit,
  p.location_city, p.location_country,
  array_remove(array[c.slug, p.brand, 'marketplace', 'digital', p.digital_kind::text], null), p.cover_image_url, p.created_at)
from public.products p left join public.product_categories c on c.id = p.category_id
where p.fulfilment::text = 'digital';

-- Sample listings (properties.is_sample, products.is_sample) are demonstration
-- content, and say so in the feed as the demo posts do. 0101's adapters
-- published them as if somebody had listed them.
create or replace function public.feed_mark_sample() returns trigger
language plpgsql security definer set search_path = public as $$
declare source_type text := case tg_table_name when 'properties' then 'property' when 'products' then 'product' end;
begin
  update public.feed_posts set is_demo = new.is_sample
  where entity_type = source_type and entity_id = new.id and is_demo is distinct from new.is_sample;
  return new;
end $$;
-- Named to fire after the adapters (triggers run in name order), so the post exists.
drop trigger if exists zz_properties_feed_sample on public.properties;
create trigger zz_properties_feed_sample after insert or update on public.properties
  for each row execute function public.feed_mark_sample();
drop trigger if exists zz_products_feed_sample on public.products;
create trigger zz_products_feed_sample after insert or update on public.products
  for each row execute function public.feed_mark_sample();
revoke execute on function public.feed_mark_sample() from public, anon, authenticated;
update public.feed_posts f set is_demo = true
from public.properties p where f.entity_type = 'property' and f.entity_id = p.id and p.is_sample and not f.is_demo;
update public.feed_posts f set is_demo = true
from public.products p where f.entity_type = 'product' and f.entity_id = p.id and p.is_sample and not f.is_demo;

-- ---------------------------------------------------------------------------
-- 4. The ranking
-- ---------------------------------------------------------------------------

create or replace function public.feed_page_mixed(
  p_limit integer default 12, p_now timestamptz default now(),
  p_after_score numeric default null, p_after_id uuid default null,
  p_kinds public.feed_kind[] default null, p_topics public.feed_topic[] default null,
  p_author_key text default null, p_saved_only boolean default false,
  p_following_only boolean default false, p_search text default null,
  p_seen_ids uuid[] default null, p_seed integer default 0,
  p_cooldown_hours integer default 72
) returns table (
  id uuid, kind public.feed_kind, topic public.feed_topic, title text, body text,
  author_id uuid, author_key text, author_name text, author_username text,
  author_role text, author_avatar_url text, author_location text,
  author_verified boolean, company_id uuid, link_href text, link_label text,
  entity_type text, entity_id uuid, price_amount numeric, price_currency text,
  price_unit text, price_change numeric, city text, region text, tags text[],
  like_count integer, comment_count integer, save_count integer, share_count integer,
  view_count integer, download_count integer, is_demo boolean,
  published_at timestamptz, media jsonb, files jsonb, viewer_liked boolean,
  viewer_saved boolean, viewer_follows boolean, seen boolean, score numeric,
  featured boolean
) language sql stable security invoker set search_path = public as $$
with viewer as (select auth.uid() uid),
me as (
  select pr.location_city, pr.primary_role::text primary_role, lower(coalesce(pr.profession, '')) profession
  from public.profiles pr where pr.id = (select uid from viewer)
),
-- Whether they let their activity and profile lean the feed. Yes until they say no.
pref as (
  select coalesce((select i.personalised from public.feed_viewer_preferences() i), true) personalised
),
chosen as (
  select unnest(i.topics) topic from public.feed_viewer_preferences() i
),
-- What had been seen when this reading began. A view recorded while
-- scrolling does not move a card across the cursor.
seen_posts as (
  -- When it was last seen before this reading began. A sighting during it
  -- moves last_seen_at past p_now; previous_seen_at keeps the value it had
  -- (first_seen_at for a row recorded before that column), so the card's
  -- place does not change while the reader scrolls.
  select v.post_id,
    case when v.last_seen_at > p_now then coalesce(v.previous_seen_at, v.first_seen_at) else v.last_seen_at end seen_at
  from public.feed_views v
  where v.user_id = (select uid from viewer) and v.first_seen_at <= p_now
  union all
  select s.id, p_now from unnest(coalesce(p_seen_ids, '{}'::uuid[])) s(id)
  where (select uid from viewer) is null
),
followed as (
  select f.author_key from public.feed_follows f
  where f.follower_id = (select uid from viewer) and f.created_at <= p_now
),
followed_profiles as (
  select f.target_id, f.target_type from public.follows f
  where f.follower_id = (select uid from viewer) and f.target_type in ('profile', 'company') and f.created_at <= p_now
),
-- Deliberate acts only. Being shown a card is not wanting more like it.
signal as (
  select p.topic, p.kind, 3::numeric w from public.feed_likes x
  join public.feed_posts p on p.id = x.post_id
  where x.user_id = (select uid from viewer) and x.created_at <= p_now
  union all
  select p.topic, p.kind, 5 from public.feed_saves x
  join public.feed_posts p on p.id = x.post_id
  where x.user_id = (select uid from viewer) and x.created_at <= p_now
  union all
  select p.topic, p.kind, least(x.weight * x.interaction_count, 12) from public.feed_interactions x
  join public.feed_posts p on p.id = x.post_id
  where x.user_id = (select uid from viewer) and x.first_interacted_at <= p_now
),
total as (select coalesce(sum(w), 0) w from signal),
kind_share as (select s.kind, sum(s.w) / nullif((select w from total), 0) share from signal s group by s.kind),
topic_share as (select s.topic, sum(s.w) / nullif((select w from total), 0) share from signal s group by s.topic),
-- How much to trust the shares: a person with two likes has said little.
confidence as (
  select least((select w from total) / 15.0, 1.0) * case when (select personalised from pref) then 1 else 0 end c
),
candidates as (
  select p.* from public.feed_posts p
  -- Written before this reading began, as well as dated before it: a post
  -- whose source was made last month and published a minute ago carries last
  -- month's date, and must still wait for the next reading.
  where p.status = 'published' and p.published_at <= p_now and p.created_at <= p_now
    and (p_kinds is null or p.kind = any (p_kinds))
    and (p_topics is null or p.topic = any (p_topics))
    and (p_author_key is null or p.author_key = p_author_key)
    and (p_search is null
         or to_tsvector('simple', p.title || ' ' || coalesce(p.body, '')) @@ plainto_tsquery('simple', p_search)
         or p.tags && string_to_array(lower(p_search), ' '))
    and (not p_saved_only or exists (select 1 from public.feed_saves x where x.post_id = p.id and x.user_id = (select uid from viewer)))
    and (not p_following_only
         or exists (select 1 from followed f where f.author_key = p.author_key)
         or exists (select 1 from followed_profiles f
                    where (f.target_type = 'profile' and f.target_id = p.author_id)
                       or (f.target_type = 'company' and f.target_id = p.company_id)))
    -- Hidden before this reading began. A card hidden while scrolling has been
    -- shown already and the page drops it; taking it out of the ranking here
    -- too would lift every card that ranked behind it across the cursor.
    and not exists (select 1 from public.feed_hidden h where h.post_id = p.id and h.user_id = (select uid from viewer) and h.created_at <= p_now)
  order by p.published_at desc, p.id desc
  limit 4000
),
reported as (
  select r.post_id, count(distinct r.reporter_id) n from public.feed_reports r
  where r.resolved_at is null and r.created_at <= p_now and r.post_id in (select c.id from candidates c)
  group by r.post_id
),
scored as (
  select c.*, sp.post_id is not null sp_seen,
    coalesce(pr.verification_status = 'verified', false) verified_now,
    (
      -- Fresh first: not seen before, then seen long ago, then lately. Strong,
      -- not absolute — once most of one kind is new and everything else has
      -- been seen, a little of the rest still comes back between them.
      case when sp.post_id is null then 80
           when sp.seen_at < p_now - make_interval(hours => greatest(p_cooldown_hours, 1)) then 50
           else 0 end
      -- Recency.
      + 24.0 / (1 + greatest(extract(epoch from (p_now - c.published_at)), 0) / 86400.0) ^ 0.6
      -- Completeness: a picture, words worth reading, an author Medosha checked.
      + case when exists (select 1 from public.feed_media m where m.post_id = c.id) then 3 else 0 end
      + case when length(coalesce(c.body, '')) >= 60 then 2 else 0 end
      + case when pr.verification_status = 'verified' then 2 else 0 end
      -- Demonstration content gives way to people's own.
      - case when c.is_demo then 6 else 0 end
      -- Editorial boost, which only Medosha can set (see the guard above).
      + least(greatest(c.boost, 0), 10)
      -- Interest: what they chose, and what they have done, as a share.
      + case when exists (select 1 from chosen x where x.topic = c.topic) then 10 else 0 end
      + (select c2.c from confidence c2) * (
          10 * coalesce((select k.share from kind_share k where k.kind = c.kind), 0)
          + 6 * coalesce((select t.share from topic_share t where t.topic = c.topic), 0))
      + case when exists (select 1 from followed f where f.author_key = c.author_key)
               or exists (select 1 from followed_profiles f
                          where (f.target_type = 'profile' and f.target_id = c.author_id)
                             or (f.target_type = 'company' and f.target_id = c.company_id)) then 12 else 0 end
      + case
          when not (select personalised from pref) then 0
          when (select primary_role from me) = 'agent' and c.kind in ('property', 'tour_360', 'investment', 'professional') then 6
          when (select primary_role from me) = 'seller' and c.kind in ('material', 'furniture', 'equipment', 'price_update') then 6
          when (select primary_role from me) = 'company' and c.topic in ('construction', 'materials') then 5
          when (select primary_role from me) = 'client' and c.kind in ('property', 'furniture', 'interior', 'ai_design') then 4
          when (select primary_role from me) = 'professional' and (select profession from me) ~ '(architect|design|interior)'
               and c.kind in ('architecture', 'interior', 'ai_design', 'furniture', 'floor_plan') then 6
          when (select primary_role from me) = 'professional' and (select profession from me) ~ '(contract|engineer|construction)'
               and c.topic in ('construction', 'materials', 'finance') then 6
          else 0 end
      + case when c.city is not null and c.city = (select location_city from me) and (select personalised from pref) then 5 else 0 end
      -- Reported and not yet looked at.
      - least(coalesce(r.n, 0), 2) * 8
      -- A steady, per-reader tie-break, so equal posts do not always fall the same way.
      + ((('x' || substr(md5(c.id::text || ':' || p_seed::text), 1, 8))::bit(32)::bigint % 1000) / 1000.0) * 4.0
    )::numeric merit,
    -- Engagement, logarithmic and capped: popular helps, never decides.
    -- Views are not in it — being shown a card is not anybody liking it — and
    -- it is kept apart from merit because it is the one part that moves while
    -- somebody scrolls: other people like things. Kept apart, a like moves
    -- that one card; inside the order the penalties below are assigned by, it
    -- would shift every card of the same author and kind along with it.
    least(ln(1 + c.like_count * 3.0 + c.comment_count * 4.0 + c.save_count * 5.0
                 + c.share_count * 4.0) * 4.0, 18)::numeric eng
  from candidates c
  left join seen_posts sp on sp.post_id = c.id
  left join reported r on r.post_id = c.id
  left join public.profiles pr on pr.id = c.author_id
  -- Three people reporting it is enough to wait for a moderator.
  where coalesce(r.n, 0) < 3
),
mixed as (
  select s.*,
    (s.merit + s.eng
      -- Each further post from the same author, of the same kind, or with the
      -- same title, pays more: the feed interleaves instead of running in blocks.
      - least((row_number() over (partition by s.author_key order by s.merit desc, s.id desc) - 1) * 6.0, 36)
      - least(8.0 * sqrt(row_number() over (partition by s.kind order by s.merit desc, s.id desc) - 1), 80)
      - case when row_number() over (partition by s.author_key, lower(s.title) order by s.merit desc, s.id desc) > 1 then 40 else 0 end
      - case when s.boost > 0 and not s.is_demo
             then least((row_number() over (partition by (s.boost > 0 and not s.is_demo) order by s.merit desc, s.id desc) - 1) * 12.0, 60)
             else 0 end
    )::numeric(20, 6) final_score
  from scored s
)
select r.id, r.kind, r.topic, r.title, r.body, r.author_id, r.author_key,
  coalesce(pr.full_name, r.author_name), pr.username, r.author_role,
  coalesce(pr.avatar_url, r.author_avatar_url), r.author_location,
  -- Read from the profile, not from what the post says about itself.
  case when r.author_id is not null then r.verified_now else r.author_verified end,
  r.company_id, r.link_href, r.link_label, r.entity_type, r.entity_id, r.price_amount,
  r.price_currency, r.price_unit, r.price_change, r.city, r.region, r.tags, r.like_count,
  r.comment_count, r.save_count, r.share_count, r.view_count, r.download_count, r.is_demo,
  r.published_at,
  coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'url', m.url,
    'posterUrl', m.poster_url, 'alt', m.alt, 'label', m.label, 'durationSeconds', m.duration_seconds,
    'width', m.width, 'height', m.height) order by m.position, m.id)
    from public.feed_media m where m.post_id = r.id), '[]'::jsonb),
  coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'fileKind', f.file_kind, 'name', f.name,
    'url', f.url, 'sizeBytes', f.size_bytes, 'downloadCount', f.download_count) order by f.position, f.id)
    from public.feed_files f where f.post_id = r.id), '[]'::jsonb),
  exists (select 1 from public.feed_likes x where x.post_id = r.id and x.user_id = (select uid from viewer)),
  exists (select 1 from public.feed_saves x where x.post_id = r.id and x.user_id = (select uid from viewer)),
  (exists (select 1 from public.feed_follows f where f.follower_id = (select uid from viewer) and f.author_key = r.author_key)
   or exists (select 1 from public.follows f where f.follower_id = (select uid from viewer)
              and ((f.target_type = 'profile' and f.target_id = r.author_id)
                   or (f.target_type = 'company' and f.target_id = r.company_id)))),
  r.sp_seen, r.final_score,
  r.boost > 0 and not r.is_demo
from mixed r
left join public.profiles pr on pr.id = r.author_id
where p_after_score is null
   or (r.final_score, r.id) < (p_after_score, coalesce(p_after_id, '00000000-0000-0000-0000-000000000000'::uuid))
order by r.final_score desc, r.id desc
limit least(greatest(p_limit, 1), 40);
$$;

grant execute on function public.feed_page_mixed(integer, timestamptz, numeric, uuid,
  public.feed_kind[], public.feed_topic[], text, boolean, boolean, text, uuid[], integer, integer)
to anon, authenticated;

commit;
