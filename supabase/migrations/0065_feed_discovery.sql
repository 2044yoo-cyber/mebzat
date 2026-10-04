-- Home stops handing back the same twelve cards.
--
-- ## What was wrong
--
-- Nothing was missing from the architecture. 0026 already had the impression
-- table, the recorder, cursor pagination and a ranking formula, and the client
-- already batched impressions and deduplicated ids. Four specific things made
-- it repeat anyway.
--
-- **The seen penalty could not win.** `- least(seen_count, 4) * 3.5` caps at
-- fourteen points against an engagement term that reaches twenty-eight for a
-- well-liked post and a freshness term worth twenty-two. A post at the top of
-- the feed stays at the top of the feed however many times it has been read,
-- and the cap means the twentieth sighting is penalised exactly as much as the
-- fourth. Being seen was a nudge; it needed to be a tier.
--
-- **A signed-out reader had no memory at all.** feed_record_views returns
-- early when auth.uid() is null and the client's tracker is inert when signed
-- out, so every term in the score was identical on every request — the same
-- twelve posts on every visit and every refresh, for ever. That is the static
-- feed in the report, exactly.
--
-- **Following somebody did nothing** unless it happened through the feed.
-- public.follows — written from profile and company pages since 0010 — was
-- never read here; only feed_follows was. Two follow buttons, one of which
-- silently did not affect the feed.
--
-- A fifth thing was not causing the repetition but was found while testing it:
-- a post published in the future aborted the query outright, because the age
-- term raised a negative number to a fractional power. The age is clamped at
-- zero below. Nothing on the platform is future-dated today, which is the only
-- reason nobody had met it.
--
-- **The tie-breaker was fixed.** The md5 wobble is stable per post, which
-- pagination needs, but it is also identical on every request, so two visits
-- an hour apart produced the same order down to the last card.
--
-- ## What this changes, and what it does not
--
-- No new table. feed_views already records exactly what a seen-content
-- mechanism needs and it is reused; the only schema change to it is
-- first_seen_at, which it did not have, backfilled from last_seen_at so
-- existing history is kept rather than reset.
--
-- No post is created, deleted, hidden or edited. No counter is touched. The
-- seeded content from 0027 stays exactly as it is — it simply stops being the
-- only thing anybody sees.

-- ---------------------------------------------------------------------------
-- 1. When a post was first seen
-- ---------------------------------------------------------------------------

alter table public.feed_views
  add column if not exists first_seen_at timestamptz;

-- Backfilled from the sighting we do have. A row that exists was seen at least
-- once, and defaulting to now() would claim every historical impression
-- happened at deploy time — which would make the cooldown below let everything
-- back in on the same day.
update public.feed_views
   set first_seen_at = last_seen_at
 where first_seen_at is null;

alter table public.feed_views
  alter column first_seen_at set default now();

do $$ begin
  alter table public.feed_views alter column first_seen_at set not null;
exception when others then null; end $$;

comment on column public.feed_views.first_seen_at is
  'When this reader first met this post. last_seen_at moves; this does not.';

-- The ranking looks the reader's seen set up by user_id and joins it on
-- post_id. The primary key is (post_id, user_id) and feed_views_user_idx is
-- (user_id, last_seen_at), so neither serves that lookup.
create index if not exists feed_views_user_post_idx
  on public.feed_views (user_id, post_id)
  include (seen_count, last_seen_at);

-- ---------------------------------------------------------------------------
-- 2. Recording a sighting
--
-- Unchanged in shape — an upsert per post, not a row per impression — with
-- first_seen_at pinned on insert and left alone afterwards.
-- ---------------------------------------------------------------------------

create or replace function public.feed_record_views(p_posts uuid[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or p_posts is null or array_length(p_posts, 1) is null then
    return;
  end if;

  insert into public.feed_views (post_id, user_id, first_seen_at, last_seen_at)
  select distinct unnest(p_posts), uid, now(), now()
  on conflict (post_id, user_id) do update
    set seen_count = public.feed_views.seen_count + 1,
        last_seen_at = now();

  update public.feed_posts
     set view_count = view_count + 1
   where id = any (p_posts) and status = 'published';
end;
$$;

grant execute on function public.feed_record_views(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The ranking
--
-- Three parameters are new, so the old signature is dropped rather than
-- replaced: `create or replace` with a different argument list makes a second
-- overload, and two overloads of one name is a PostgREST call that fails to
-- resolve rather than a feed that works.
--
-- ## The formula, in the order it is written below
--
--   tier            2000 unseen | 1000 seen but cooled off | 0 seen recently
--   engagement      ln(1 + weighted interactions) * 6      up to about 28
--   freshness       22 / (1 + days)^0.6                    22 today, 4 a week
--   boost           editorial thumb, in points
--   topic affinity  from this reader's likes and saves     up to 9 + 9
--   author affinity they have engaged with this author     6
--   follow          they follow the author or the company  14
--   location        the post's city is the reader's        5
--   repeat          -6 per sighting, to a floor of -120
--   diversity       -5 per post the same author already has above this one
--   wobble          seeded: 0 to 5 signed in, 0 to 10 signed out
--
-- The diversity term is what keeps a follow from swallowing the page. Without
-- it, following one prolific author put twelve of their posts in the top
-- twelve — every one of the fourteen-point bonuses landing at once — and Home
-- became a following feed, which is the one thing it must not be. Each author's
-- own posts are ranked against each other and pushed down by their position, so
-- the best two or three keep the boost and the twentieth competes on merit.
--
-- The tier dominates everything else on purpose. Every unseen post outranks
-- every seen one, whatever its engagement, so a reader works through what is
-- new to them before anything is repeated — and because the tiers are ordered
-- rather than filtered, the cursor (score, id) still walks a single stream and
-- the feed never runs empty. Content already read is not deleted from the
-- reader's world: it waits below the unseen tier, and after the cooldown it
-- climbs back into the middle one.
--
-- ## Signed out
--
-- There is nobody to record against, so the seen set arrives from the browser
-- in p_seen_ids — the ids that session has already been shown, kept in
-- sessionStorage. Capped at 400 by the caller: an unbounded array is an
-- unbounded query.
--
-- p_seed varies the wobble. For a signed-in reader the tier already changes
-- the feed after every scroll, so the seed is derived from them and stays put.
-- Signed out there is nothing else to vary, so it is random per request, which
-- is what makes a refresh a different mix rather than the same twelve cards.

drop function if exists public.feed_page(
  integer, timestamptz, numeric, uuid, public.feed_kind[], public.feed_topic[],
  text, boolean, boolean, text
);

create or replace function public.feed_page(
  p_limit integer default 12,
  p_now timestamptz default now(),
  p_after_score numeric default null,
  p_after_id uuid default null,
  p_kinds public.feed_kind[] default null,
  p_topics public.feed_topic[] default null,
  p_author_key text default null,
  p_saved_only boolean default false,
  p_following_only boolean default false,
  p_search text default null,
  p_seen_ids uuid[] default null,
  p_seed integer default 0,
  p_cooldown_hours integer default 168
)
returns table (
  id uuid,
  kind public.feed_kind,
  topic public.feed_topic,
  title text,
  body text,
  author_id uuid,
  author_key text,
  author_name text,
  author_username text,
  author_role text,
  author_avatar_url text,
  author_location text,
  author_verified boolean,
  company_id uuid,
  link_href text,
  link_label text,
  entity_type text,
  entity_id uuid,
  price_amount numeric,
  price_currency text,
  price_unit text,
  price_change numeric,
  city text,
  region text,
  tags text[],
  like_count integer,
  comment_count integer,
  save_count integer,
  share_count integer,
  view_count integer,
  download_count integer,
  is_demo boolean,
  published_at timestamptz,
  media jsonb,
  files jsonb,
  viewer_liked boolean,
  viewer_saved boolean,
  viewer_follows boolean,
  seen boolean,
  score numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with viewer as (
    select auth.uid() as uid
  ),
  me as (
    select pr.location_city
    from public.profiles pr
    where pr.id = (select uid from viewer)
  ),
  -- The reader's seen set, gathered once and joined, rather than a correlated
  -- subquery evaluated per candidate row.
  seen_posts as (
    select v.post_id, v.seen_count, v.last_seen_at
    from public.feed_views v
    where v.user_id = (select uid from viewer)
    union all
    -- Signed out: the session's own list, with no counts to weigh.
    select s.id, 1, p_now
    from unnest(coalesce(p_seen_ids, '{}'::uuid[])) as s(id)
    where (select uid from viewer) is null
  ),
  -- Both follow graphs. public.follows is written from profile and company
  -- pages, feed_follows from the card. A reader who pressed either one meant
  -- the same thing.
  followed as (
    select f.author_key
    from public.feed_follows f
    where f.follower_id = (select uid from viewer)
  ),
  followed_profiles as (
    select fo.target_id, fo.target_type
    from public.follows fo
    where fo.follower_id = (select uid from viewer)
      and fo.target_type in ('profile', 'company')
  ),
  -- What this reader keeps engaging with, as a weight per topic. Capped so a
  -- single obsession cannot crowd out everything else — a feed that only ever
  -- shows cement is a worse feed even for someone who likes cement.
  affinity as (
    select p.topic, least(count(*)::numeric * 1.2, 9)::numeric as weight
    from public.feed_likes l
    join public.feed_posts p on p.id = l.post_id
    where l.user_id = (select uid from viewer)
    group by p.topic
  ),
  saved_affinity as (
    select p.topic, least(count(*)::numeric * 1.6, 9)::numeric as weight
    from public.feed_saves s
    join public.feed_posts p on p.id = s.post_id
    where s.user_id = (select uid from viewer)
    group by p.topic
  ),
  -- Authors this reader has liked or saved before. "More like the thing you
  -- interacted with", without a model: the strongest available signal that two
  -- posts are alike is that the same person wrote them.
  author_affinity as (
    select p.author_key
    from public.feed_posts p
    where exists (
      select 1 from public.feed_likes l
      where l.post_id = p.id and l.user_id = (select uid from viewer)
    ) or exists (
      select 1 from public.feed_saves s
      where s.post_id = p.id and s.user_id = (select uid from viewer)
    )
    group by p.author_key
  ),
  scored as (
    select
      p.*,
      sp.seen_count as sp_seen_count,
      sp.post_id is not null as sp_seen,
      (
          case
            when sp.post_id is null then 2000.0
            when sp.last_seen_at < p_now - make_interval(hours => greatest(p_cooldown_hours, 1))
              then 1000.0
            else 0.0
          end
        + ln(1 + p.like_count * 3.0 + p.comment_count * 4.0
                + p.save_count * 5.0 + p.share_count * 4.0
                + p.view_count * 0.15) * 6.0
        -- Age clamped at zero. A post dated in the future makes this
        -- subtraction negative, and a negative base raised to 0.6 is
        -- "a negative number raised to a non-integer power yields a complex
        -- result" — which does not misrank the post, it aborts the query and
        -- takes the whole homepage down with it. Scheduling a post an hour
        -- ahead is an ordinary thing to want; 500ing on it is not.
        + 22.0 / (1 + greatest(extract(epoch from (p_now - p.published_at)), 0) / 86400.0) ^ 0.6
        + p.boost
        + coalesce((select a.weight from affinity a where a.topic = p.topic), 0)
        + coalesce((select sa.weight from saved_affinity sa where sa.topic = p.topic), 0)
        + case when exists (
            select 1 from author_affinity aa where aa.author_key = p.author_key
          ) then 6.0 else 0 end
        + case
            when exists (select 1 from followed f where f.author_key = p.author_key)
              or exists (
                select 1 from followed_profiles fp
                where (fp.target_type = 'profile' and fp.target_id = p.author_id)
                   or (fp.target_type = 'company' and fp.target_id = p.company_id)
              )
            then 14.0 else 0
          end
        + case
            when p.city is not null and p.city = (select location_city from me)
            then 5.0 else 0
          end
        -- Every repeat costs, with a floor rather than a cap at the fourth:
        -- something met twenty times should sit below something met twice.
        - greatest(least(coalesce(sp.seen_count, 0), 20) * 6.0, 0)
        -- A deterministic wobble keyed on the post and the request's seed.
        -- Stable within one reading session because the seed rides the cursor,
        -- and wide enough to genuinely reorder posts of similar standing.
        --
        -- Worth twice as much signed out, and the figure is measured rather
        -- than picked: at five points two seeds returned ten of the same
        -- twelve cards, which is not a different mix by any reading. At ten
        -- they share five. Going higher buys nothing until twenty-six, by
        -- which point the wobble is louder than the engagement term and weak
        -- posts start outranking strong ones.
        + ((('x' || substr(md5(p.id::text || ':' || p_seed::text), 1, 8))::bit(32)::bigint % 1000)
           / 1000.0)
          * case when (select uid from viewer) is null then 10.0 else 5.0 end
      )::numeric(20, 6) as merit
    from public.feed_posts p
    left join seen_posts sp on sp.post_id = p.id
    where p.status = 'published'
      and (p_kinds is null or p.kind = any (p_kinds))
      and (p_topics is null or p.topic = any (p_topics))
      and (p_author_key is null or p.author_key = p_author_key)
      and (
        p_search is null
        or to_tsvector('simple', p.title || ' ' || coalesce(p.body, ''))
           @@ plainto_tsquery('simple', p_search)
        or p.tags && string_to_array(lower(p_search), ' ')
      )
      and (
        not p_saved_only
        or exists (
          select 1 from public.feed_saves s
          where s.post_id = p.id and s.user_id = (select uid from viewer)
        )
      )
      and (
        not p_following_only
        or exists (select 1 from followed f where f.author_key = p.author_key)
        or exists (
          select 1 from followed_profiles fp
          where (fp.target_type = 'profile' and fp.target_id = p.author_id)
             or (fp.target_type = 'company' and fp.target_id = p.company_id)
        )
      )
      and not exists (
        select 1 from public.feed_hidden h
        where h.post_id = p.id and h.user_id = (select uid from viewer)
      )
  ),
  -- One author should not own the page. Their posts are ranked against each
  -- other over the whole candidate set — not over the page — so the penalty is
  -- the same value on every page and the cursor still walks one ordered stream.
  base as (
    select
      s.*,
      (
        s.merit
        - least(
            greatest(
              row_number() over (
                partition by s.author_key order by s.merit desc, s.id desc
              ) - 1,
              0),
            10) * 5.0
      )::numeric(20, 6) as score
    from scored s
  )
  select
    b.id,
    b.kind,
    b.topic,
    b.title,
    b.body,
    b.author_id,
    b.author_key,
    coalesce(pr.full_name, b.author_name) as author_name,
    pr.username as author_username,
    b.author_role,
    coalesce(pr.avatar_url, b.author_avatar_url) as author_avatar_url,
    b.author_location,
    b.author_verified,
    b.company_id,
    b.link_href,
    b.link_label,
    b.entity_type,
    b.entity_id,
    b.price_amount,
    b.price_currency,
    b.price_unit,
    b.price_change,
    b.city,
    b.region,
    b.tags,
    b.like_count,
    b.comment_count,
    b.save_count,
    b.share_count,
    b.view_count,
    b.download_count,
    b.is_demo,
    b.published_at,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', m.id, 'kind', m.kind, 'url', m.url, 'posterUrl', m.poster_url,
          'alt', m.alt, 'label', m.label, 'durationSeconds', m.duration_seconds,
          'width', m.width, 'height', m.height
        ) order by m.position, m.id
      )
      from public.feed_media m where m.post_id = b.id
    ), '[]'::jsonb) as media,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', f.id, 'fileKind', f.file_kind, 'name', f.name, 'url', f.url,
          'sizeBytes', f.size_bytes, 'downloadCount', f.download_count
        ) order by f.position, f.id
      )
      from public.feed_files f where f.post_id = b.id
    ), '[]'::jsonb) as files,
    exists (
      select 1 from public.feed_likes l
      where l.post_id = b.id and l.user_id = (select uid from viewer)
    ) as viewer_liked,
    exists (
      select 1 from public.feed_saves s
      where s.post_id = b.id and s.user_id = (select uid from viewer)
    ) as viewer_saved,
    (
      exists (select 1 from followed f where f.author_key = b.author_key)
      or exists (
        select 1 from followed_profiles fp
        where (fp.target_type = 'profile' and fp.target_id = b.author_id)
           or (fp.target_type = 'company' and fp.target_id = b.company_id)
      )
    ) as viewer_follows,
    b.sp_seen as seen,
    b.score
  from base b
  left join public.profiles pr on pr.id = b.author_id
  where p_after_score is null
     or (b.score, b.id) < (p_after_score, coalesce(p_after_id, '00000000-0000-0000-0000-000000000000'::uuid))
  order by b.score desc, b.id desc
  limit least(greatest(p_limit, 1), 40);
$$;

grant execute on function public.feed_page(
  integer, timestamptz, numeric, uuid, public.feed_kind[], public.feed_topic[],
  text, boolean, boolean, text, uuid[], integer, integer
) to anon, authenticated;
