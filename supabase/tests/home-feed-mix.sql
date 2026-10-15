-- The Home feed (0109): what reaches it, what never does, and that it mixes,
-- moves on between visits, and pages without repeating itself.
--
-- Ranks the migrations' own content plus a creator's worth of rows made here
-- through each feature's table, as that creator — the adapters are what is
-- under test, so nothing is written to feed_posts by hand except where a test
-- needs a post the app would not make. Readers run as `authenticated` with
-- `request.jwt.claim.sub`; a superuser would bypass the policies this leans on.

begin;

insert into auth.users (id, email) values
  ('cb000000-0000-4000-8000-000000000001', 'feed-reader-one@example.test'),
  ('cb000000-0000-4000-8000-000000000002', 'feed-reader-two@example.test'),
  ('cb000000-0000-4000-8000-000000000003', 'feed-reader-new@example.test'),
  ('cb000000-0000-4000-8000-0000000000c0', 'feed-creator@example.test')
on conflict (id) do nothing;

-- ---------------------------------------------------------------- creator
set role authenticated;
set local request.jwt.claim.sub = 'cb000000-0000-4000-8000-0000000000c0';

insert into public.services (provider_id, title, slug, status) values
  (auth.uid(), 'HF public joinery', 'hf-ps-public', 'published'),
  (auth.uid(), 'HF draft joinery', 'hf-ps-draft', 'draft');
insert into public.jobs (poster_id, title, slug, description, status, visibility) values
  (auth.uid(), 'HF public job', 'hf-pj-public', 'Hiring a site engineer', 'open', 'public'),
  (auth.uid(), 'HF draft job', 'hf-pj-draft', 'Hiring', 'draft', 'public'),
  (auth.uid(), 'HF private job', 'hf-pj-private', 'Hiring', 'open', 'private');
insert into public.equipment (owner_id, title, slug, category, status, daily_rate) values
  (auth.uid(), 'HF public mixer', 'hf-pe-public', 'concrete', 'published', 1500),
  (auth.uid(), 'HF draft mixer', 'hf-pe-draft', 'concrete', 'draft', 1500);
insert into public.posts (author_id, title, body, status) values
  (auth.uid(), 'HF public discussion', 'Which waterproofing holds up on a flat roof in Addis?', 'published'),
  (auth.uid(), 'HF hidden discussion', 'Hidden', 'hidden');
insert into public.invest_projects (owner_id, title, slug, location, funding_goal, published) values
  (auth.uid(), 'HF public fund', 'hf-pi-public', 'Addis Ababa', 1000, true),
  (auth.uid(), 'HF draft fund', 'hf-pi-draft', 'Addis Ababa', 1000, false);
insert into public.designs (owner_id, title, slug, kind, spec, visibility, published_at) values
  (auth.uid(), 'HF public cabinet', 'hf-pd-public', 'cabinet', '{}', 'public', now()),
  (auth.uid(), 'HF unlisted cabinet', 'hf-pd-unlisted', 'cabinet', '{}', 'unlisted', now()),
  (auth.uid(), 'HF private cabinet', 'hf-pd-private', 'cabinet', '{}', 'private', null);
insert into public.products (owner_id, title, slug, status, fulfilment, digital_kind, delivery_available) values
  (auth.uid(), 'HF public floor plan', 'hf-pf-public', 'published', 'digital', 'floor_plan', false),
  (auth.uid(), 'HF public BOQ', 'hf-pb-public', 'published', 'digital', 'other', false),
  (auth.uid(), 'HF draft floor plan', 'hf-pf-draft', 'draft', 'digital', 'floor_plan', false);
insert into public.products (owner_id, title, slug, status, fulfilment) values
  (auth.uid(), 'HF public wardrobe', 'hf-pw-public', 'published', 'physical'),
  (auth.uid(), 'HF draft wardrobe', 'hf-pw-draft', 'draft', 'physical');
insert into public.properties (owner_id, title, slug, property_type, latitude, longitude, status) values
  (auth.uid(), 'HF public flat', 'hf-pp-public', 'apartment', 9.01, 38.76, 'available'),
  (auth.uid(), 'HF draft flat', 'hf-pp-draft', 'apartment', 9.01, 38.76, 'draft');
insert into public.properties (owner_id, title, slug, property_type, latitude, longitude, status, is_sample) values
  (auth.uid(), 'HF sample flat', 'hf-pp-sample', 'apartment', 9.01, 38.76, 'available', true);
reset role;

-- ================================================================ 1. sources
do $$
declare missing text; wrong text;
begin
  select string_agg(t, ', ') into missing from unnest(array['HF public joinery', 'HF public job', 'HF public mixer',
    'HF public discussion', 'HF public fund', 'HF public cabinet', 'HF public floor plan', 'HF public BOQ',
    'HF public wardrobe', 'HF public flat']) t
  where (select count(*) from public.feed_posts f where f.title = t and f.status = 'published') <> 1;
  if missing is not null then raise exception 'FAIL 1: not exactly one published post for %', missing; end if;

  select string_agg(f.title || '=' || f.kind || '/' || f.entity_type, ', ') into wrong
  from public.feed_posts f
  where f.title like 'HF public %' and (f.kind::text, f.entity_type) not in (
    ('professional', 'service'), ('professional', 'job'), ('equipment', 'equipment'),
    ('discussion', 'community_post'), ('investment', 'invest'), ('ai_design', 'design'),
    ('floor_plan', 'product'), ('document', 'product'), ('equipment', 'product'), ('furniture', 'product'),
    ('property', 'property'));
  if wrong is not null then raise exception 'FAIL 1: filed under the wrong kind: %', wrong; end if;
  if (select kind::text from public.feed_posts where title = 'HF public floor plan') <> 'floor_plan'
     or (select kind::text from public.feed_posts where title = 'HF public BOQ') <> 'document' then
    raise exception 'FAIL 1: a digital product is not filed as a file';
  end if;
  raise notice 'ok 1: a service, a job, equipment, a discussion, an investment, a Berchuma design, digital files, a product and a property each reach the feed once';
end $$;

-- ======================================================== 2. never in the feed
do $$
declare leaked text;
begin
  select string_agg(f.title, ', ') into leaked from public.feed_posts f
  where f.status = 'published' and f.title in ('HF draft joinery', 'HF draft job', 'HF private job', 'HF draft mixer',
    'HF hidden discussion', 'HF draft fund', 'HF unlisted cabinet', 'HF private cabinet', 'HF draft floor plan',
    'HF draft wardrobe', 'HF draft flat');
  if leaked is not null then raise exception 'FAIL 2: published in the feed: %', leaked; end if;
  raise notice 'ok 2: drafts, private, hidden and unlisted work is not published to the feed';
end $$;

-- Withdrawing takes it out; editing does not make a second one.
set role authenticated;
set local request.jwt.claim.sub = 'cb000000-0000-4000-8000-0000000000c0';
update public.services set title = 'HF public joinery (edited)' where slug = 'hf-ps-public';
update public.services set title = 'HF public joinery (edited again)' where slug = 'hf-ps-public';
update public.jobs set visibility = 'private' where slug = 'hf-pj-public';
update public.designs set visibility = 'private' where slug = 'hf-pd-public';
update public.products set status = 'draft' where slug = 'hf-pw-public';
reset role;

do $$
begin
  if (select count(*) from public.feed_posts f join public.services s on s.id = f.entity_id
      where f.entity_type = 'service' and s.slug = 'hf-ps-public') <> 1 then
    raise exception 'FAIL 3: editing a service made another post';
  end if;
  if not exists (select 1 from public.feed_posts where title = 'HF public joinery (edited again)' and status = 'published') then
    raise exception 'FAIL 3: an edit did not reach the post';
  end if;
  if exists (select 1 from public.feed_posts where title in ('HF public job', 'HF public cabinet', 'HF public wardrobe') and status = 'published') then
    raise exception 'FAIL 3: a job made private, a design made private or a product taken back to draft is still in the feed';
  end if;
  if not (select is_demo from public.feed_posts where title = 'HF sample flat') then
    raise exception 'FAIL 3: a sample listing is not marked as demonstration content';
  end if;
  raise notice 'ok 3: edits update the one post; going private or back to draft takes it out; samples are labelled';
end $$;

-- Put them back for the ranking below.
set role authenticated;
set local request.jwt.claim.sub = 'cb000000-0000-4000-8000-0000000000c0';
update public.jobs set visibility = 'public' where slug = 'hf-pj-public';
update public.designs set visibility = 'public' where slug = 'hf-pd-public';
update public.products set status = 'published' where slug = 'hf-pw-public';
reset role;

-- ======================================================= 4. the author's guard
set role authenticated;
set local request.jwt.claim.sub = 'cb000000-0000-4000-8000-0000000000c0';
insert into public.feed_posts (id, kind, topic, title, author_id, author_key, author_name, author_verified,
  boost, like_count, save_count, view_count, is_demo, published_at, created_at)
values ('cb111111-0000-4000-8000-000000000001', 'discussion', 'community', 'HF self promoted',
  auth.uid(), 'profile:cb000000-0000-4000-8000-000000000001', 'Somebody else', true,
  10, 999, 999, 99999, true, now() + interval '1 year', now() - interval '1 year');
update public.feed_posts set boost = 9, like_count = 5000, published_at = now() + interval '2 years', is_demo = true,
  author_key = 'profile:cb000000-0000-4000-8000-000000000002'
where id = 'cb111111-0000-4000-8000-000000000001';
reset role;

do $$
declare p public.feed_posts;
begin
  select * into p from public.feed_posts where id = 'cb111111-0000-4000-8000-000000000001';
  if p.boost <> 0 or p.like_count <> 0 or p.save_count <> 0 or p.view_count <> 0 then
    raise exception 'FAIL 4: an author set their own numbers: boost %, likes %, saves %, views %', p.boost, p.like_count, p.save_count, p.view_count;
  end if;
  if p.is_demo or p.author_verified then raise exception 'FAIL 4: an author set demo % or verified %', p.is_demo, p.author_verified; end if;
  if p.published_at > now() or p.created_at < now() then raise exception 'FAIL 4: an author dated their post % / %', p.published_at, p.created_at; end if;
  if p.author_key <> 'profile:cb000000-0000-4000-8000-0000000000c0' then raise exception 'FAIL 4: an author posted as %', p.author_key; end if;
  raise notice 'ok 4: through the API an author cannot boost, count, date, verify, or re-attribute their own post';
end $$;

-- The counters still count: a like is the system's write, not the author's.
set role authenticated;
set local request.jwt.claim.sub = 'cb000000-0000-4000-8000-000000000002';
insert into public.feed_likes (post_id, user_id) values ('cb111111-0000-4000-8000-000000000001', auth.uid());
select public.feed_record_views(array['cb111111-0000-4000-8000-000000000001'::uuid], now());
select public.feed_record_views(array['cb111111-0000-4000-8000-000000000001'::uuid], now());
reset role;
do $$
declare p public.feed_posts;
begin
  select * into p from public.feed_posts where id = 'cb111111-0000-4000-8000-000000000001';
  if p.like_count <> 1 then raise exception 'FAIL 5: a like was not counted (%)', p.like_count; end if;
  if p.view_count <> 1 then raise exception 'FAIL 5: views counted % times for one reader', p.view_count; end if;
  raise notice 'ok 5: likes count, and a reader''s views count once however often they are recorded';
end $$;

-- ===================================================== 6. interests are private
set role authenticated;
set local request.jwt.claim.sub = 'cb000000-0000-4000-8000-000000000002';
insert into public.feed_interests (user_id, topics) values (auth.uid(), '{materials}');
set local request.jwt.claim.sub = 'cb000000-0000-4000-8000-000000000001';
do $$
begin
  if exists (select 1 from public.feed_interests where user_id = 'cb000000-0000-4000-8000-000000000002') then
    raise exception 'FAIL 6: one reader can read another''s interests';
  end if;
  begin
    insert into public.feed_interests (user_id, topics) values ('cb000000-0000-4000-8000-000000000003', '{property}');
    raise exception 'FAIL 6: one reader wrote another''s interests';
  exception when insufficient_privilege then null;
  end;
  update public.feed_interests set topics = '{}' where user_id = 'cb000000-0000-4000-8000-000000000002';
  raise notice 'ok 6: interests are readable and writable by their owner only';
end $$;
reset role;
set role anon;
set local request.jwt.claim.sub = '';
do $$
begin
  perform 1 from public.feed_interests;
  raise exception 'FAIL 6: a visitor can read interests';
exception when insufficient_privilege then
  raise notice 'ok 6b: a visitor cannot read interests at all';
end $$;
reset role;
do $$
begin
  if (select topics from public.feed_interests where user_id = 'cb000000-0000-4000-8000-000000000002') <> '{materials}' then
    raise exception 'FAIL 6: another reader''s update reached the row';
  end if;
end $$;

-- Everything made above is older than the readings below begin.
update public.feed_posts set created_at = created_at - interval '2 hours', published_at = published_at - interval '2 hours'
where created_at > now() - interval '1 hour';

-- ======================================= 7. a new reader gets a mixed first page
set role authenticated;
set local request.jwt.claim.sub = 'cb000000-0000-4000-8000-000000000003';
do $$
declare kinds int; props int; longest int; draft int;
begin
  select count(distinct kind), count(*) filter (where kind = 'property') into kinds, props
  from public.feed_page_mixed(p_limit => 24, p_seed => 7);
  select max(n) into longest from (select count(*) n from (
    select kind, row_number() over (order by score desc, id desc) - row_number() over (partition by kind order by score desc, id desc) g
    from public.feed_page_mixed(p_limit => 24, p_seed => 7)) z group by kind, g) y;
  if kinds < 8 then raise exception 'FAIL 7: a new reader''s first 24 has only % kinds', kinds; end if;
  if props > 12 then raise exception 'FAIL 7: % of a new reader''s first 24 are property listings', props; end if;
  if longest > 3 then raise exception 'FAIL 7: % cards of one kind in a row', longest; end if;
  raise notice 'ok 7: a new reader''s first 24: % kinds, % properties, at most % of a kind in a row', kinds, props, longest;
end $$;
reset role;

-- ================================= 8. it moves on between visits, and stays mixed
-- The root cause: 0101 counted every card shown as interest in its kind, and
-- the feed was one kind by the second visit. Ten visits a day apart, each
-- recording what it showed the way the app does.
create temporary table visits (v int, ids uuid[], kinds int, props int);
grant all on visits to authenticated;
set role authenticated;
set local request.jwt.claim.sub = 'cb000000-0000-4000-8000-000000000001';
do $$
declare v int; at timestamptz; shown uuid[];
begin
  for v in 1..6 loop
    at := now() + make_interval(days => v);
    select array_agg(id order by score desc, id desc) into shown from public.feed_page_mixed(p_limit => 24, p_now => at, p_seed => 42);
    insert into visits select v, shown, count(distinct p.kind), count(*) filter (where p.kind = 'property')
      from public.feed_posts p where p.id = any (shown);
    -- What feed_record_views writes, stamped at the visit's own time.
    reset role;
    insert into public.feed_views (post_id, user_id, first_seen_at, last_seen_at, seen_count)
    select unnest(shown), 'cb000000-0000-4000-8000-000000000001', at, at, 1
    on conflict (post_id, user_id) do update set previous_seen_at = feed_views.last_seen_at, last_seen_at = excluded.last_seen_at, seen_count = feed_views.seen_count + 1;
    set role authenticated;
  end loop;
end $$;
reset role;
do $$
declare r record; repeats int; prev uuid[];
begin
  for r in select * from visits order by v loop
    if r.kinds < 5 then raise exception 'FAIL 8: visit % shows only % kinds', r.v, r.kinds; end if;
    if r.props > 18 then raise exception 'FAIL 8: visit % is % of 24 property listings', r.v, r.props; end if;
    if r.v > 1 then
      select ids into prev from visits where v = r.v - 1;
      select count(*) into repeats from unnest(r.ids[1:12]) i where i = any (prev);
      if repeats > 0 then raise exception 'FAIL 8: visit % opens with % cards the visit before showed', r.v, repeats; end if;
    end if;
  end loop;
  raise notice 'ok 8: six visits, each at least 5 kinds, never mostly property, and each opens with cards the last one did not show';
end $$;

-- ================================= 9. paging is stable while the reader reads
-- One reading, walked a page at a time while doing what readers do between
-- pages: sightings recorded, a card hidden, one liked, one opened twice, and
-- somebody else publishing an old draft. Every card arrives once, and in the
-- order the reading would have had if none of that had happened.
reset role;
-- Some history, so seen tiers are in play: seen long ago, and seen lately but first long ago.
insert into public.feed_views (post_id, user_id, first_seen_at, last_seen_at, seen_count)
select p.id, 'cb000000-0000-4000-8000-000000000002', now() - interval '300 hours',
  case when row_number() over (order by p.id) % 2 = 0 then now() - interval '200 hours' else now() - interval '1 hour' end, 2
from public.feed_posts p where p.status = 'published' and p.published_at < now() - interval '1 hour'
order by p.id limit 40
on conflict do nothing;
-- And things they did before it began, which they do again during it.
insert into public.feed_interactions (user_id, post_id, kind, weight, first_interacted_at, last_interacted_at)
select 'cb000000-0000-4000-8000-000000000002', p.id, 'contact', 6, now() - interval '1 day', now() - interval '1 day'
from public.feed_posts p where p.status = 'published' and p.kind = 'property' order by p.id limit 6
on conflict do nothing;
-- A post withdrawn before the reading.
set role authenticated;
set local request.jwt.claim.sub = 'cb000000-0000-4000-8000-0000000000c0';
update public.equipment set status = 'draft' where slug = 'hf-pe-public';
reset role;
create temporary table reading (kind text, pos int, id uuid);
grant all on reading to authenticated;

set role authenticated;
set local request.jwt.claim.sub = 'cb000000-0000-4000-8000-000000000002';
do $$
declare
  started timestamptz := now() - interval '1 second';
  score numeric; after uuid; page uuid[]; n int := 0; pages int := 0; chunk int;
  r record;
begin
  -- The order, read in big pages before anything happens.
  loop
    page := '{}';
    for r in select * from public.feed_page_mixed(p_limit => 40, p_now => started, p_after_score => score, p_after_id => after, p_seed => 5) loop
      n := n + 1; insert into reading values ('reference', n, r.id); page := page || r.id; score := r.score; after := r.id;
    end loop;
    exit when cardinality(page) < 40;
  end loop;

  n := 0; score := null; after := null;
  loop
    page := '{}';
    for r in select * from public.feed_page_mixed(p_limit => 12, p_now => started, p_after_score => score, p_after_id => after, p_seed => 5) loop
      n := n + 1; insert into reading values ('walked', n, r.id); page := page || r.id; score := r.score; after := r.id;
    end loop;
    pages := pages + 1;
    exit when cardinality(page) < 12;
    perform public.feed_record_views(page, started);
    if pages = 1 then
      -- The same reader on another device, seeing cards further down this
      -- reading — twice — before this one reaches them.
      for chunk in 0..2 loop
        perform public.feed_record_views(array(select rr.id from reading rr where rr.kind = 'reference' and rr.pos > 30 + chunk * 100 and rr.pos <= 130 + chunk * 100), started);
        perform public.feed_record_views(array(select rr.id from reading rr where rr.kind = 'reference' and rr.pos > 30 + chunk * 100 and rr.pos <= 130 + chunk * 100), started);
      end loop;
      insert into public.feed_likes (post_id, user_id) values (page[2], auth.uid()) on conflict do nothing;
      perform public.feed_record_interaction(page[3], 'open');
      perform public.feed_record_interaction(page[3], 'open');
      perform public.feed_record_interaction(x.post_id, 'contact')
      from public.feed_interactions x where x.user_id = auth.uid() and x.kind = 'contact';
    elsif pages = 2 then
      insert into public.feed_hidden (post_id, user_id) values (page[4], auth.uid()) on conflict do nothing;
      reset role;
      -- Somebody publishing a post dated last month, mid-reading.
      insert into public.feed_posts (kind, topic, title, author_name, author_key, status, published_at)
      values ('discussion', 'community', 'HF published mid-reading', 'Medosha', 'medosha:test', 'published', now() - interval '30 days');
      set role authenticated;
    end if;
  end loop;
  raise notice 'walked % pages', pages;
end $$;
reset role;
do $$
declare refs int; walked int; dups int; out_of_order int; late int;
begin
  select count(*) into refs from reading where kind = 'reference';
  select count(*), count(*) - count(distinct id) into walked, dups from reading where kind = 'walked';
  if dups > 0 then raise exception 'FAIL 9: % cards came twice while paging', dups; end if;
  select count(*) into out_of_order from reading a join reading b on a.pos = b.pos
  where a.kind = 'reference' and b.kind = 'walked' and a.id <> b.id;
  if walked <> refs or out_of_order > 0 then
    raise exception 'FAIL 9: paging diverged from the reading''s order: % walked, % expected, % positions differ', walked, refs, out_of_order;
  end if;
  select count(*) into late from reading r join public.feed_posts p on p.id = r.id where p.title = 'HF published mid-reading';
  if late > 0 then raise exception 'FAIL 9: a post published mid-reading slipped into it'; end if;
  if exists (select 1 from reading r join public.feed_posts p on p.id = r.id where p.status <> 'published' or p.title = 'HF public mixer') then
    raise exception 'FAIL 9: the reading showed a post that is not published';
  end if;
  if refs < 100 then raise exception 'FAIL 9: only % cards to page through; the check is too small to mean anything', refs; end if;
  raise notice 'ok 9: % cards in pages of 12, each once and in order, through sightings, a like, opens, a hide and a mid-reading post', walked;
end $$;

-- And the next reading has it.
set role authenticated;
set local request.jwt.claim.sub = 'cb000000-0000-4000-8000-000000000003';
do $$
begin
  if not exists (select 1 from public.feed_page_mixed(p_limit => 40, p_now => now() + interval '1 second', p_search => 'mid-reading') where title = 'HF published mid-reading') then
    raise exception 'FAIL 9b: a published post did not reach the next reading';
  end if;
  raise notice 'ok 9b: the next reading includes what was published during the last';
end $$;
reset role;

-- Nor does the feed show a creator their own unpublished posts, which their
-- row-level security would let them read.
set role authenticated;
set local request.jwt.claim.sub = 'cb000000-0000-4000-8000-0000000000c0';
do $$
begin
  if exists (select 1 from public.feed_page_mixed(p_limit => 40, p_author_key => 'profile:cb000000-0000-4000-8000-0000000000c0') f
             join public.feed_posts p on p.id = f.id where p.status <> 'published') then
    raise exception 'FAIL 9c: a creator''s feed shows their own withdrawn post';
  end if;
  if not exists (select 1 from public.feed_posts where author_id = auth.uid() and status <> 'published') then
    raise exception 'FAIL 9c: the creator has nothing withdrawn, so this proves nothing';
  end if;
  raise notice 'ok 9c: the feed shows a creator only what is published, not their withdrawn posts';
end $$;
-- And what they have just published, they see first.
reset role;
insert into public.feed_posts (kind, topic, title, author_id, author_key, author_name, status, published_at, created_at)
values ('progress', 'construction', 'HF just posted', 'cb000000-0000-4000-8000-0000000000c0', 'profile:cb000000-0000-4000-8000-0000000000c0', 'Selam', 'published', now() - interval '5 minutes', now() - interval '5 minutes');
set role authenticated;
set local request.jwt.claim.sub = 'cb000000-0000-4000-8000-0000000000c0';
do $$
declare mine numeric; theirs numeric;
begin
  if not exists (select 1 from (select title from public.feed_page_mixed(p_limit => 3, p_seed => 11)) top where top.title = 'HF just posted') then
    raise exception 'FAIL 9d: a creator does not see what they just published near the top of their feed';
  end if;
  select score into mine from public.feed_page_mixed(p_limit => 40, p_seed => 11, p_search => 'just posted') where title = 'HF just posted';
  -- The same post, the same clock and seed, read by somebody else.
  set local request.jwt.claim.sub = 'cb000000-0000-4000-8000-000000000003';
  select score into theirs from public.feed_page_mixed(p_limit => 40, p_seed => 11, p_search => 'just posted') where title = 'HF just posted';
  if mine - theirs < 20 then
    raise exception 'FAIL 9d: the creator''s own new post scores % for them and % for others — lifted for everyone or for nobody', mine, theirs;
  end if;
  raise notice 'ok 9d: a creator sees what they just published first (% for them, % for others)', mine, theirs;
end $$;
reset role;

-- ================================================== 10. different readers differ
-- Reader two likes and saves materials and furniture; reader three has done
-- nothing. Same seed, same clock: only what they did differs.
insert into public.feed_likes (post_id, user_id, created_at)
select p.id, 'cb000000-0000-4000-8000-000000000002', now() - interval '3 days'
from public.feed_posts p where p.status = 'published' and p.kind in ('material', 'furniture') order by p.id limit 8
on conflict do nothing;
insert into public.feed_saves (post_id, user_id, created_at)
select p.id, 'cb000000-0000-4000-8000-000000000002', now() - interval '3 days'
from public.feed_posts p where p.status = 'published' and p.kind in ('material', 'furniture') order by p.id desc limit 4
on conflict do nothing;
delete from public.feed_views where user_id = 'cb000000-0000-4000-8000-000000000002';
delete from public.feed_hidden where user_id = 'cb000000-0000-4000-8000-000000000002';
-- Reader three opts out too, so theirs is the feed nobody's activity leans.
insert into public.feed_interests (user_id, topics, personalised) values ('cb000000-0000-4000-8000-000000000003', '{}', false);
create temporary table tops (who text, ids uuid[], leaning int);
grant all on tops to authenticated;

set role authenticated;
set local request.jwt.claim.sub = 'cb000000-0000-4000-8000-000000000002';
insert into tops select 'two', array_agg(id order by score desc, id desc), count(*) filter (where kind in ('material', 'furniture'))
  from public.feed_page_mixed(p_limit => 24, p_seed => 3, p_now => now() + interval '1 minute');
update public.feed_interests set topics = '{}', personalised = false where user_id = auth.uid();
insert into tops select 'two, not personalised', array_agg(id order by score desc, id desc), count(*) filter (where kind in ('material', 'furniture'))
  from public.feed_page_mixed(p_limit => 24, p_seed => 3, p_now => now() + interval '1 minute');
set local request.jwt.claim.sub = 'cb000000-0000-4000-8000-000000000003';
insert into tops select 'three', array_agg(id order by score desc, id desc), count(*) filter (where kind in ('material', 'furniture'))
  from public.feed_page_mixed(p_limit => 24, p_seed => 3, p_now => now() + interval '1 minute');
reset role;
do $$
declare two tops; off tops; three tops;
begin
  select * into two from tops where who = 'two';
  select * into off from tops where who = 'two, not personalised';
  select * into three from tops where who = 'three';
  if two.ids = three.ids then raise exception 'FAIL 10: two readers with different histories get the same feed'; end if;
  if two.leaning <= three.leaning then
    raise exception 'FAIL 10: a reader who likes materials and furniture sees no more of them (% vs %)', two.leaning, three.leaning;
  end if;
  if cardinality(two.ids) - (select count(*) from unnest(two.ids) i where i = any (three.ids)) < 1 then
    raise exception 'FAIL 10: the readers'' first pages hold the same cards';
  end if;
  if off.ids is distinct from three.ids then
    raise exception 'FAIL 10: with "learn from what I do" off, the feed still leans on activity';
  end if;
  raise notice 'ok 10: likes and saves lean the feed (% vs % materials and furniture in 24), and turning that off undoes it', two.leaning, three.leaning;
end $$;

-- Choosing topics, and nothing else, is enough to see them: someone who asks
-- for materials and equipment gets most of what there is near the top.
insert into auth.users (id, email) values ('cb000000-0000-4000-8000-000000000004', 'feed-chooser@example.test') on conflict do nothing;
insert into public.feed_interests (user_id, topics) values ('cb000000-0000-4000-8000-000000000004', '{materials,equipment}');
set role authenticated;
set local request.jwt.claim.sub = 'cb000000-0000-4000-8000-000000000004';
do $$
declare chosen int; supply int; kinds int;
begin
  select count(*) filter (where topic in ('materials', 'equipment')), count(distinct kind) into chosen, kinds
  from public.feed_page_mixed(p_limit => 24, p_seed => 3);
  select count(*) into supply from public.feed_posts where status = 'published' and topic in ('materials', 'equipment');
  if chosen * 3 < supply * 2 then raise exception 'FAIL 10b: chose materials and equipment, got % of % in the first 24', chosen, supply; end if;
  if kinds < 8 then raise exception 'FAIL 10b: choosing topics narrowed the feed to % kinds', kinds; end if;
  raise notice 'ok 10b: chosen topics alone bring % of their % posts into the first 24, which still holds % kinds', chosen, supply, kinds;
end $$;
reset role;

-- ========================================= 11. featured is labelled and limited
-- Sixteen listings Medosha has featured, from sixteen different people, so
-- only the featured rule can be what spaces them out.
insert into public.feed_posts (kind, topic, title, body, author_name, author_key, status, boost, published_at, created_at)
select (array['property', 'material', 'furniture', 'equipment', 'architecture', 'interior', 'floor_plan', 'professional']::public.feed_kind[])[1 + g % 8],
  'construction', 'HF featured ' || g, 'A featured listing, long enough to count as a description of something.',
  'Featured seller ' || g, 'profile:featured-' || g, 'published', 10, now() - interval '3 hours', now() - interval '3 hours'
from generate_series(1, 16) g;
update public.feed_posts set boost = 10 where title = 'HF sample flat';
set role authenticated;
set local request.jwt.claim.sub = 'cb000000-0000-4000-8000-000000000003';
do $$
declare shown int; labelled_demo int;
begin
  select count(*) filter (where featured) into shown from public.feed_page_mixed(p_limit => 12, p_seed => 3);
  select count(*) into labelled_demo from public.feed_page_mixed(p_limit => 40, p_seed => 3) where featured and is_demo;
  if shown = 0 then raise exception 'FAIL 11: no featured card is labelled as featured'; end if;
  if shown > 4 then raise exception 'FAIL 11: % of the first 12 are featured', shown; end if;
  if labelled_demo > 0 then raise exception 'FAIL 11: sample content is labelled featured'; end if;
  raise notice 'ok 11: featured cards are labelled, % of the first 12, never sample content', shown;
end $$;
reset role;

-- =================================================== 12. visitors, and grants
set role anon;
set local request.jwt.claim.sub = '';
do $$
declare first uuid[]; again uuid[];
begin
  select array_agg(id order by score desc, id desc) into first from public.feed_page_mixed(p_limit => 12, p_seed => 9);
  if cardinality(first) <> 12 then raise exception 'FAIL 12: a visitor gets no feed'; end if;
  select array_agg(id order by score desc, id desc) into again from public.feed_page_mixed(p_limit => 12, p_seed => 9, p_seen_ids => first);
  if (select count(*) from unnest(again) i where i = any (first)) > 0 then
    raise exception 'FAIL 12: a visitor''s session memory does not move what they have seen down';
  end if;
  begin
    perform public.feed_record_views(first, now());
    raise exception 'FAIL 12: a visitor can record views';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok 12: a visitor gets a feed, moves past what this tab has shown, and cannot write views';
end $$;
reset role;

rollback;
