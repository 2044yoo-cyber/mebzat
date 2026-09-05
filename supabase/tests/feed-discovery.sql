-- Home stops repeating: the checks, run against this database.
--
--   Paste into the Supabase SQL editor and run, after applying 0065. It prints
--   one line per check and rolls itself back — every row it creates is gone
--   when it finishes, and nothing that was already here is read for writing.
--
-- It builds its own twenty posts rather than ranking yours. Asserting "the top
-- twelve changed" against live content would pass or fail on whatever happens
-- to be posted this week, and a check that depends on the weather is not a
-- check. What it does use of yours is the real schema, the real policies and
-- the real feed_page — which is the half that can actually be wrong.
--
-- It runs as `authenticated`, not as the editor's default role. A superuser
-- bypasses row-level security, so a probe run as one reports that every rule
-- works and proves nothing.

begin;

-- ------------------------------------------------------------------ fixtures

insert into auth.users (id, email) values
  ('ee000000-0000-4000-8000-000000000001', 'feedprobe1@example.test'),
  ('ee000000-0000-4000-8000-000000000002', 'feedprobe2@example.test'),
  ('ee000000-0000-4000-8000-0000000000aa', 'feedprobea@example.test')
on conflict (id) do nothing;

insert into public.profiles (id, username, full_name) values
  ('ee000000-0000-4000-8000-000000000001', 'feed_probe_1', 'Feed Probe One'),
  ('ee000000-0000-4000-8000-000000000002', 'feed_probe_2', 'Feed Probe Two'),
  ('ee000000-0000-4000-8000-0000000000aa', 'feed_probe_a', 'Feed Probe Author')
on conflict (id) do nothing;

-- Twenty posts by one author, with a spread of engagement and age so the
-- scores are not all equal. Published far in the future for two reasons: they
-- then sort above whatever is really on the platform, so the checks below see
-- only these; and a future date is what proved the age term used to abort the
-- whole query rather than rank the post.
insert into public.feed_posts (
  id, kind, topic, title, body, author_id, author_key, author_name,
  like_count, comment_count, save_count, view_count, published_at
)
select
  ('ee111111-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid,
  (array['property','material','progress','cost_tip','question',
         'architecture','floor_plan','video']::public.feed_kind[])[1 + g % 8],
  (array['property','materials','design','construction',
         'equipment','learning']::public.feed_topic[])[1 + g % 6],
  'Feed probe ' || g,
  'Probe body ' || g,
  'ee000000-0000-4000-8000-0000000000aa',
  'profile:ee000000-0000-4000-8000-0000000000aa',
  'Feed Probe Author',
  (g * 7) % 90, (g * 3) % 20, (g * 5) % 30, (g * 31) % 400,
  now() + interval '10 years' - make_interval(hours => g)
from generate_series(1, 20) as g;

-- Everything below looks only at the probe's own posts, through feed_page's
-- own author filter rather than by filtering its output. Filtering the output
-- of a page of eight returns however many of the eight happened to be the
-- probe's, so "a full page" fails on a database that has any other content —
-- which is every database this is meant to run on.
create temporary view probe as
  select * from public.feed_page(
    p_limit => 8,
    p_author_key => 'profile:ee000000-0000-4000-8000-0000000000aa');

-- The view belongs to the editor's role; the checks run as `authenticated`.
-- Without this every check below fails on permissions rather than on the
-- thing it is testing, which is the worst kind of green-to-red.
grant select on probe to authenticated, anon;

-- ===================================================================
-- 1. A reader who has seen nothing gets unseen content
-- ===================================================================
set role authenticated;
set local request.jwt.claim.sub = 'ee000000-0000-4000-8000-000000000001';

select '0. a future-dated post does not abort the query' as step,
       count(*) > 0 as should_be_true from probe;

select '1. the first page is all unseen' as step,
       bool_and(not seen) as should_be_true from probe;
select '1b. and it is a full page' as step, count(*) = 8 as should_be_true from probe;

-- ===================================================================
-- 2. Reading it means the next page is different content
-- ===================================================================
select public.feed_record_views(array(select id from probe));

select '2. nothing from the first page comes back' as step,
       count(*) = 0 as should_be_true
from probe where seen;

select '2b. and first_seen_at was recorded' as step,
       bool_and(first_seen_at is not null) as should_be_true
from public.feed_views
where user_id = 'ee000000-0000-4000-8000-000000000001';

-- ===================================================================
-- 3. Reading everything does not empty the feed
-- ===================================================================
select public.feed_record_views(
  array(select id from public.feed_posts where title like 'Feed probe %'));

select '3. the feed still returns a full page' as step,
       count(*) = 8 as should_be_true from probe;
select '3b. now honestly marked as seen' as step,
       bool_and(seen) as should_be_true from probe;

-- Read four of them twice more, then check they sank.
select public.feed_record_views(array(
  select id from public.feed_posts where title like 'Feed probe %' order by id limit 4));
select public.feed_record_views(array(
  select id from public.feed_posts where title like 'Feed probe %' order by id limit 4));

select '3c. the most-read sink below the rest' as step,
       coalesce(max(v.seen_count), 0) < 3 as should_be_true
from probe f
join public.feed_views v
  on v.post_id = f.id and v.user_id = 'ee000000-0000-4000-8000-000000000001';

-- ===================================================================
-- 4. Following from a profile page changes the feed
--
-- public.follows, not feed_follows: the profile and company follow buttons
-- write there, and until 0065 the feed never read it.
-- ===================================================================
reset role;
set role authenticated;
set local request.jwt.claim.sub = 'ee000000-0000-4000-8000-000000000002';

create temporary table before_follow as select id, score from probe;

reset role;
insert into public.follows (follower_id, target_type, target_id)
values ('ee000000-0000-4000-8000-000000000002', 'profile',
        'ee000000-0000-4000-8000-0000000000aa')
on conflict do nothing;

set role authenticated;
set local request.jwt.claim.sub = 'ee000000-0000-4000-8000-000000000002';

select '4. following a profile raises their posts' as step,
       (select min(score) from probe) > (select min(score) from before_follow)
         as should_be_true;
select '4b. and the card knows it' as step,
       bool_and(viewer_follows) as should_be_true from probe;

-- ===================================================================
-- 5. One author cannot own the page
--
-- Every probe post has the same author. Without the diversity term they would
-- all carry the same +14 and the page would be nothing but this author.
-- ===================================================================
-- Measured on the score spread, not on "the scores are all different": the
-- wobble already makes every score distinct, so that assertion held perfectly
-- with the diversity term deleted. It said nothing and looked like a check.
--
-- The term costs five points per position for the first ten, so an author with
-- twenty posts spans about fifty points more than their merit alone. Measured
-- on this fixture: 62.9 with the term, 12.9 without. Forty separates them with
-- room on both sides.
select '5. one author''s posts are spread, not stacked' as step,
       (select max(score) - min(score)
        from public.feed_page(
          p_limit => 20,
          p_author_key => 'profile:ee000000-0000-4000-8000-0000000000aa')) > 40
       as should_be_true;

-- ===================================================================
-- 6. Signed out
-- ===================================================================
reset role;
set role anon;
set local request.jwt.claim.sub = '';

select '6. anonymous browsing works' as step,
       count(*) = 8 as should_be_true from probe;

select '6b. and the session list is honoured' as step,
       count(*) = 0 as should_be_true
from public.feed_page(
  p_limit => 8,
  p_seen_ids => array(select id from public.feed_posts where title like 'Feed probe %')
) where title like 'Feed probe %' and not seen;

select '6c. two seeds give a different order' as step,
       (select string_agg(id::text, ',' order by score desc)
        from public.feed_page(p_limit => 8, p_seed => 1) where title like 'Feed probe %')
    is distinct from
       (select string_agg(id::text, ',' order by score desc)
        from public.feed_page(p_limit => 8, p_seed => 2) where title like 'Feed probe %')
         as should_be_true;

-- ===================================================================
-- 7. Cursor pagination returns each post once
-- ===================================================================
reset role;
set role authenticated;
set local request.jwt.claim.sub = 'ee000000-0000-4000-8000-000000000002';

do $$
declare
  s numeric := null; i uuid := null; r record;
  ids uuid[] := '{}'; dupes int;
begin
  for n in 1..4 loop
    for r in select * from public.feed_page(
      p_limit => 5, p_after_score => s, p_after_id => i)
    loop
      ids := ids || r.id; s := r.score; i := r.id;
    end loop;
  end loop;

  select coalesce(array_length(ids, 1), 0) - count(distinct x) into dupes from unnest(ids) x;
  if dupes = 0 then
    raise notice '7. twenty ids over four pages, no repeats';
  else
    raise warning '7. FAILED: % repeats across pages', dupes;
  end if;
end $$;

reset role;
rollback;

-- Nothing above survives. Confirm with:
--   select count(*) from public.feed_posts where title like 'Feed probe %';
