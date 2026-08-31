-- The Smart Discovery Feed.
--
-- The homepage used to be a stack of fixed sections — featured products,
-- featured companies, featured projects — which is a shop window: the same
-- thing every visit, and nothing to come back to tomorrow. This replaces it
-- with one ranked, endless feed that mixes everything the platform knows
-- about: properties for sale, material prices that moved this week, a site
-- photo from a slab pour in Ayat, a DWG a firm is giving away, a question
-- somebody needs answered.
--
-- Two design decisions are worth stating up front.
--
-- First, a feed row carries its own content rather than pointing at one of
-- eleven other tables. A union across products, properties, projects,
-- equipment, posts and prices would need eleven joins on every page of an
-- infinite scroll, and would rank badly because none of those tables share a
-- notion of engagement. Instead a post is a post; `entity_type`/`entity_id`
-- and `link_href` connect it back to the real record when there is one.
--
-- Second, `author_id` is nullable. Seeded demo content has no auth user
-- behind it, and inventing rows in auth.users to satisfy a foreign key would
-- put fake people in the login system. Demo posts carry their author inline
-- and are flagged `is_demo`, so they can be labelled in the UI and deleted in
-- one statement when the platform has real users.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- What a card is. The UI picks a layout from this: a property card shows
-- price and location, a before/after card shows a slider, a document card
-- shows a download button.
create type public.feed_kind as enum (
  'property',            -- a listing for sale or rent
  'material',            -- a marketplace product
  'furniture',
  'equipment',           -- plant and machinery for hire
  'progress',            -- construction progress from a live site
  'architecture',        -- a finished building or a design
  'interior',
  'ai_design',           -- generated in Medosha AI Studio
  'before_after',
  'floor_plan',
  'boq_template',
  'cost_tip',
  'price_update',        -- a material price that moved
  'video',
  'tutorial',
  'document',            -- DWG, Revit, SketchUp, Excel, PDF
  'announcement',        -- from a company
  'professional',        -- a profile worth following
  'investment',
  'question',
  'discussion',
  'learning',            -- a course or a lesson
  'success_story'
);

-- The coarse grouping the recommender works in. Kinds are too fine to learn
-- from: liking three cement posts should surface steel prices, not only
-- cement.
create type public.feed_topic as enum (
  'property',
  'materials',
  'design',
  'construction',
  'equipment',
  'finance',
  'learning',
  'community'
);

create type public.feed_status as enum ('published', 'hidden', 'removed');

create type public.feed_media_kind as enum ('image', 'video');

create type public.feed_file_kind as enum (
  'pdf',
  'dwg',
  'revit',
  'sketchup',
  'excel',
  'word',
  'image',
  'archive'
);

-- ---------------------------------------------------------------------------
-- feed_posts
-- ---------------------------------------------------------------------------

create table public.feed_posts (
  id uuid primary key default gen_random_uuid(),

  kind public.feed_kind not null,
  topic public.feed_topic not null,

  title text not null check (length(title) between 1 and 300),
  body text check (body is null or length(body) <= 8000),

  -- The author. Exactly one of these two shapes is filled in.
  author_id uuid references public.profiles (id) on delete cascade,
  company_id uuid references public.companies (id) on delete set null,
  -- Inline identity for seeded content, and the display fallback for a post
  -- whose author has since deleted their profile.
  author_name text,
  author_role text,
  author_avatar_url text,
  author_location text,
  author_verified boolean not null default false,

  -- Stable key for the follow graph. Covers both shapes: 'profile:<uuid>'
  -- for a real member, 'demo:<slug>' for seeded content — so one follow table
  -- serves both and the UI does not branch.
  author_key text not null,

  -- Where the card's primary action goes. Nullable: a tip or a question is
  -- read in place and has nowhere to send you.
  link_href text,
  link_label text,

  -- The real record behind the card, when there is one.
  entity_type text,
  entity_id uuid,

  -- Commerce. Set on property, material, furniture, equipment and investment
  -- cards; null everywhere else.
  price_amount numeric(14, 2) check (price_amount is null or price_amount >= 0),
  price_currency text not null default 'ETB',
  price_unit text,
  -- Movement for a price update: +4.2 means up 4.2 percent.
  price_change numeric(6, 2),

  city text,
  region text,

  tags text[] not null default '{}',

  -- Denormalised counters, maintained by trigger. A feed sorts on these, and
  -- a correlated subquery per row is what makes an infinite scroll slow.
  like_count integer not null default 0,
  comment_count integer not null default 0,
  save_count integer not null default 0,
  share_count integer not null default 0,
  view_count integer not null default 0,
  download_count integer not null default 0,

  -- Editorial thumb on the scale, in score points. Used sparingly: a safety
  -- notice should outrank a sofa.
  boost real not null default 0,

  is_demo boolean not null default false,
  status public.feed_status not null default 'published',

  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A post is either by a member or by an inline author, never neither.
  constraint feed_posts_has_author check (
    author_id is not null or author_name is not null
  )
);

comment on table public.feed_posts is
  'One row per card in the Smart Discovery Feed. Carries its own content; entity_type/entity_id link back to the underlying record when one exists.';
comment on column public.feed_posts.author_key is
  'profile:<uuid> or demo:<slug>. The follow graph keys on this so seeded authors are followable too.';
comment on column public.feed_posts.is_demo is
  'Seeded demonstration content. Labelled in the UI and removable with one delete.';

create index feed_posts_rank_idx
  on public.feed_posts (published_at desc)
  where status = 'published';
create index feed_posts_kind_idx
  on public.feed_posts (kind, published_at desc)
  where status = 'published';
create index feed_posts_topic_idx
  on public.feed_posts (topic, published_at desc)
  where status = 'published';
create index feed_posts_author_idx
  on public.feed_posts (author_key, published_at desc);
create index feed_posts_engagement_idx
  on public.feed_posts (like_count desc, published_at desc)
  where status = 'published';
create index feed_posts_tags_idx on public.feed_posts using gin (tags);
create index feed_posts_city_idx on public.feed_posts (city)
  where city is not null;
-- Tags are deliberately left out of this expression: array_to_string is
-- STABLE, not IMMUTABLE, so including it makes the index illegal. Tag search
-- goes through feed_posts_tags_idx instead, and feed_page's search predicate
-- matches this expression exactly so it can actually use the index.
create index feed_posts_search_idx
  on public.feed_posts
  using gin (to_tsvector('simple', title || ' ' || coalesce(body, '')));

create trigger feed_posts_set_updated_at
  before update on public.feed_posts
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- feed_media
-- Images and video. `label` carries the before/after pairing; nothing else
-- uses it.
-- ---------------------------------------------------------------------------

create table public.feed_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feed_posts (id) on delete cascade,
  kind public.feed_media_kind not null default 'image',
  url text not null,
  -- The still shown before a video plays. A feed that autoplays on scroll
  -- still needs something on screen while the first frame loads.
  poster_url text,
  alt text,
  label text,
  duration_seconds integer,
  width integer,
  height integer,
  position smallint not null default 0
);

create index feed_media_post_idx on public.feed_media (post_id, position);

-- ---------------------------------------------------------------------------
-- feed_files
-- The downloadable half of the feed: Revit families, DWG details, BOQ
-- spreadsheets, standards PDFs.
-- ---------------------------------------------------------------------------

create table public.feed_files (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feed_posts (id) on delete cascade,
  file_kind public.feed_file_kind not null,
  name text not null,
  url text not null,
  size_bytes bigint,
  download_count integer not null default 0,
  position smallint not null default 0
);

create index feed_files_post_idx on public.feed_files (post_id, position);

-- ---------------------------------------------------------------------------
-- Interactions
-- ---------------------------------------------------------------------------

create table public.feed_likes (
  post_id uuid not null references public.feed_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index feed_likes_user_idx on public.feed_likes (user_id, created_at desc);

create table public.feed_saves (
  post_id uuid not null references public.feed_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index feed_saves_user_idx on public.feed_saves (user_id, created_at desc);

-- Threaded properly, not one level: a reply to a reply is how an answer to a
-- technical question actually reads. Depth is capped so the client never has
-- to render an arbitrarily deep tree on a phone.
create table public.feed_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feed_posts (id) on delete cascade,
  parent_id uuid references public.feed_comments (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete cascade,
  author_name text,
  author_avatar_url text,
  body text not null check (length(body) between 1 and 4000),
  -- A comment can be a photo. "Show me the crack" is answered with a picture,
  -- not a paragraph.
  image_url text,
  depth smallint not null default 0 check (depth between 0 and 4),
  like_count integer not null default 0,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feed_comments_has_author check (
    author_id is not null or author_name is not null
  )
);

create index feed_comments_post_idx on public.feed_comments (post_id, created_at);
create index feed_comments_parent_idx on public.feed_comments (parent_id)
  where parent_id is not null;

create trigger feed_comments_set_updated_at
  before update on public.feed_comments
  for each row
  execute function public.set_updated_at();

create table public.feed_comment_likes (
  comment_id uuid not null references public.feed_comments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

-- Following an author. Keyed on author_key rather than a profile id so a
-- seeded author and a member work the same way.
create table public.feed_follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  author_key text not null,
  created_at timestamptz not null default now(),
  primary key (follower_id, author_key)
);

create index feed_follows_author_idx on public.feed_follows (author_key);

create table public.feed_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feed_posts (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null,
  detail text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (post_id, reporter_id)
);

create index feed_reports_open_idx on public.feed_reports (created_at desc)
  where resolved_at is null;

-- What a reader has already been shown. Two jobs: keep the feed from
-- repeating itself on the next visit, and give the recommender something to
-- learn from that does not require a click.
create table public.feed_views (
  post_id uuid not null references public.feed_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  seen_count integer not null default 1,
  last_seen_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index feed_views_user_idx on public.feed_views (user_id, last_seen_at desc);

-- Posts a reader has told us not to show. "Not interested" has to mean
-- something or it is a placebo button.
create table public.feed_hidden (
  post_id uuid not null references public.feed_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Counter triggers
-- Each one touches a single row by primary key, so the write cost is a page
-- update rather than a scan.
-- ---------------------------------------------------------------------------

create or replace function public.feed_bump_likes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.feed_posts set like_count = like_count + 1 where id = new.post_id;
  else
    update public.feed_posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end;
$$;

create trigger feed_likes_count
  after insert or delete on public.feed_likes
  for each row execute function public.feed_bump_likes();

create or replace function public.feed_bump_saves()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.feed_posts set save_count = save_count + 1 where id = new.post_id;
  else
    update public.feed_posts set save_count = greatest(save_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end;
$$;

create trigger feed_saves_count
  after insert or delete on public.feed_saves
  for each row execute function public.feed_bump_saves();

create or replace function public.feed_bump_comments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.feed_posts set comment_count = comment_count + 1 where id = new.post_id;
  else
    update public.feed_posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end;
$$;

create trigger feed_comments_count
  after insert or delete on public.feed_comments
  for each row execute function public.feed_bump_comments();

create or replace function public.feed_bump_comment_likes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.feed_comments set like_count = like_count + 1 where id = new.comment_id;
  else
    update public.feed_comments set like_count = greatest(like_count - 1, 0) where id = old.comment_id;
  end if;
  return null;
end;
$$;

create trigger feed_comment_likes_count
  after insert or delete on public.feed_comment_likes
  for each row execute function public.feed_bump_comment_likes();

-- A reply inherits its parent's depth plus one, capped. Computing it here
-- rather than trusting the client means the cap actually holds.
create or replace function public.feed_comment_depth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_depth smallint;
begin
  if new.parent_id is null then
    new.depth := 0;
  else
    select depth into parent_depth from public.feed_comments where id = new.parent_id;
    new.depth := least(coalesce(parent_depth, 0) + 1, 4);
  end if;
  return new;
end;
$$;

create trigger feed_comments_depth
  before insert on public.feed_comments
  for each row execute function public.feed_comment_depth();

-- ---------------------------------------------------------------------------
-- Row level security
--
-- Reading the feed is public — that is the point of a discovery surface, and
-- a signed-out visitor has to be able to see what the platform is. Writing
-- anything is authenticated, and every interaction row is owned by the person
-- who made it.
-- ---------------------------------------------------------------------------

alter table public.feed_posts enable row level security;
alter table public.feed_media enable row level security;
alter table public.feed_files enable row level security;
alter table public.feed_likes enable row level security;
alter table public.feed_saves enable row level security;
alter table public.feed_comments enable row level security;
alter table public.feed_comment_likes enable row level security;
alter table public.feed_follows enable row level security;
alter table public.feed_reports enable row level security;
alter table public.feed_views enable row level security;
alter table public.feed_hidden enable row level security;

create policy feed_posts_read on public.feed_posts
  for select using (status = 'published' or author_id = auth.uid());

create policy feed_posts_write on public.feed_posts
  for insert to authenticated
  with check (author_id = auth.uid());

create policy feed_posts_update on public.feed_posts
  for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy feed_posts_delete on public.feed_posts
  for delete to authenticated
  using (author_id = auth.uid());

create policy feed_media_read on public.feed_media
  for select using (
    exists (
      select 1 from public.feed_posts p
      where p.id = post_id and (p.status = 'published' or p.author_id = auth.uid())
    )
  );

create policy feed_media_write on public.feed_media
  for all to authenticated
  using (
    exists (select 1 from public.feed_posts p where p.id = post_id and p.author_id = auth.uid())
  )
  with check (
    exists (select 1 from public.feed_posts p where p.id = post_id and p.author_id = auth.uid())
  );

create policy feed_files_read on public.feed_files
  for select using (
    exists (
      select 1 from public.feed_posts p
      where p.id = post_id and (p.status = 'published' or p.author_id = auth.uid())
    )
  );

create policy feed_files_write on public.feed_files
  for all to authenticated
  using (
    exists (select 1 from public.feed_posts p where p.id = post_id and p.author_id = auth.uid())
  )
  with check (
    exists (select 1 from public.feed_posts p where p.id = post_id and p.author_id = auth.uid())
  );

-- Like counts are public; who liked is not something the feed needs to show,
-- but a reader must be able to see their own rows to know what they liked.
create policy feed_likes_own on public.feed_likes
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy feed_saves_own on public.feed_saves
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy feed_comments_read on public.feed_comments
  for select using (
    exists (select 1 from public.feed_posts p where p.id = post_id and p.status = 'published')
  );

create policy feed_comments_write on public.feed_comments
  for insert to authenticated
  with check (author_id = auth.uid());

create policy feed_comments_update on public.feed_comments
  for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy feed_comments_delete on public.feed_comments
  for delete to authenticated
  using (author_id = auth.uid());

create policy feed_comment_likes_own on public.feed_comment_likes
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Follower counts are public, so the select side is open; only the owner may
-- add or remove a follow.
create policy feed_follows_read on public.feed_follows for select using (true);
create policy feed_follows_write on public.feed_follows
  for insert to authenticated with check (follower_id = auth.uid());
create policy feed_follows_delete on public.feed_follows
  for delete to authenticated using (follower_id = auth.uid());

create policy feed_reports_own on public.feed_reports
  for all to authenticated
  using (reporter_id = auth.uid())
  with check (reporter_id = auth.uid());

create policy feed_views_own on public.feed_views
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy feed_hidden_own on public.feed_hidden
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- feed_page — the ranked, paginated feed
--
-- The ranking, in words: a post's score starts from how much the platform's
-- readers engaged with it, decays with age so the feed is not a museum, and
-- is then adjusted for *this* reader — up for topics they interact with and
-- authors they follow, down for things they have already scrolled past.
--
-- Pagination is keyset on (score, id) rather than offset, because an offset
-- into a ranked list shifts under you the moment anything is liked. `p_now`
-- is passed in from the first page and threaded through the rest so the decay
-- term is frozen for the duration of one scroll — otherwise a page boundary
-- can drop or repeat a post as the clock moves.
-- ---------------------------------------------------------------------------

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
  p_search text default null
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
  -- What this reader keeps engaging with, as a weight per topic. Capped so a
  -- single obsession cannot crowd out everything else — a feed that only ever
  -- shows cement is a worse feed even for someone who likes cement.
  affinity as (
    select
      p.topic,
      least(count(*)::numeric * 1.2, 9)::numeric as weight
    from public.feed_likes l
    join public.feed_posts p on p.id = l.post_id
    where l.user_id = (select uid from viewer)
    group by p.topic
  ),
  saved_affinity as (
    select
      p.topic,
      least(count(*)::numeric * 1.6, 9)::numeric as weight
    from public.feed_saves s
    join public.feed_posts p on p.id = s.post_id
    where s.user_id = (select uid from viewer)
    group by p.topic
  ),
  base as (
    select
      p.*,
      -- Engagement. Logarithmic: the difference between 5 likes and 50
      -- matters, between 500 and 5000 much less, and a linear term would let
      -- one viral post sit at the top of the feed for a month.
      (
          ln(1 + p.like_count * 3.0 + p.comment_count * 4.0
                + p.save_count * 5.0 + p.share_count * 4.0
                + p.view_count * 0.15) * 6.0
        -- Freshness. Roughly: today is worth ~10 points, a week ago ~4, a
        -- month ago ~1.
        + 22.0 / (1 + extract(epoch from (p_now - p.published_at)) / 86400.0) ^ 0.6
        + p.boost
        + coalesce((select a.weight from affinity a where a.topic = p.topic), 0)
        + coalesce((select sa.weight from saved_affinity sa where sa.topic = p.topic), 0)
        -- Followed authors jump the queue, which is the entire promise of a
        -- follow button.
        + case
            when exists (
              select 1 from public.feed_follows f
              where f.follower_id = (select uid from viewer)
                and f.author_key = p.author_key
            ) then 14.0 else 0
          end
        -- Already seen. Not a ban: something read once and worth reading
        -- again can still climb back on engagement.
        - coalesce((
            select least(v.seen_count, 4) * 3.5
            from public.feed_views v
            where v.post_id = p.id and v.user_id = (select uid from viewer)
          ), 0)
        -- A deterministic wobble keyed on the post id. Enough to break ties
        -- between the many posts that score identically on a young platform,
        -- and stable so pagination does not shuffle underneath the reader.
        + (('x' || substr(md5(p.id::text), 1, 8))::bit(32)::bigint % 1000) / 1000.0
      )::numeric(20, 6) as score
    from public.feed_posts p
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
        or exists (
          select 1 from public.feed_follows f
          where f.author_key = p.author_key and f.follower_id = (select uid from viewer)
        )
      )
      and not exists (
        select 1 from public.feed_hidden h
        where h.post_id = p.id and h.user_id = (select uid from viewer)
      )
  )
  select
    b.id,
    b.kind,
    b.topic,
    b.title,
    b.body,
    b.author_id,
    b.author_key,
    -- A member's own profile wins over the inline copy, so a rename shows up
    -- on their old posts instead of freezing at whatever it was that day.
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
    exists (
      select 1 from public.feed_follows f
      where f.author_key = b.author_key and f.follower_id = (select uid from viewer)
    ) as viewer_follows,
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
  text, boolean, boolean, text
) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Interaction functions
--
-- Toggles rather than separate add/remove calls: the client holds one boolean
-- and the server owns the transition, so a double tap cannot leave the row
-- and the counter disagreeing.
-- ---------------------------------------------------------------------------

create or replace function public.feed_toggle_like(p_post uuid)
returns table (liked boolean, like_count integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  -- Rows removed by the delete: integer, because that is what GET
  -- DIAGNOSTICS returns. Declaring it boolean coerces the count on
  -- assignment and then refuses to compare it back.
  removed integer;
begin
  if uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  delete from public.feed_likes where post_id = p_post and user_id = uid;
  get diagnostics removed = row_count;

  if removed = 0 then
    insert into public.feed_likes (post_id, user_id) values (p_post, uid)
      on conflict do nothing;
  end if;

  return query
    select removed = 0, p.like_count from public.feed_posts p where p.id = p_post;
end;
$$;

grant execute on function public.feed_toggle_like(uuid) to authenticated;

create or replace function public.feed_toggle_save(p_post uuid)
returns table (saved boolean, save_count integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  -- Rows removed by the delete: integer, because that is what GET
  -- DIAGNOSTICS returns. Declaring it boolean coerces the count on
  -- assignment and then refuses to compare it back.
  removed integer;
begin
  if uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  delete from public.feed_saves where post_id = p_post and user_id = uid;
  get diagnostics removed = row_count;

  if removed = 0 then
    insert into public.feed_saves (post_id, user_id) values (p_post, uid)
      on conflict do nothing;
  end if;

  return query
    select removed = 0, p.save_count from public.feed_posts p where p.id = p_post;
end;
$$;

grant execute on function public.feed_toggle_save(uuid) to authenticated;

create or replace function public.feed_toggle_follow(p_author_key text)
returns table (following boolean, follower_count integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  -- Rows removed by the delete: integer, because that is what GET
  -- DIAGNOSTICS returns. Declaring it boolean coerces the count on
  -- assignment and then refuses to compare it back.
  removed integer;
begin
  if uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  delete from public.feed_follows where follower_id = uid and author_key = p_author_key;
  get diagnostics removed = row_count;

  if removed = 0 then
    insert into public.feed_follows (follower_id, author_key)
      values (uid, p_author_key)
      on conflict do nothing;
  end if;

  return query
    select
      removed = 0,
      (select count(*)::integer from public.feed_follows f where f.author_key = p_author_key);
end;
$$;

grant execute on function public.feed_toggle_follow(text) to authenticated;

-- Sharing is counted, not gated: the count is what tells an author their post
-- travelled, and there is nothing to authorise about copying a link.
create or replace function public.feed_record_share(p_post uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  update public.feed_posts
     set share_count = share_count + 1
   where id = p_post and status = 'published'
  returning share_count;
$$;

grant execute on function public.feed_record_share(uuid) to anon, authenticated;

create or replace function public.feed_record_download(p_file uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  with bumped as (
    update public.feed_files
       set download_count = download_count + 1
     where id = p_file
    returning post_id, download_count
  ),
  post as (
    update public.feed_posts p
       set download_count = p.download_count + 1
      from bumped b
     where p.id = b.post_id
    returning p.download_count
  )
  select download_count from bumped;
$$;

grant execute on function public.feed_record_download(uuid) to anon, authenticated;

-- Views arrive in batches from one scroll, so this takes an array. Upsert
-- rather than insert: a second sighting is a stronger signal than a first,
-- and a row per impression would grow without limit.
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

  insert into public.feed_views (post_id, user_id)
  select unnest(p_posts), uid
  on conflict (post_id, user_id) do update
    set seen_count = public.feed_views.seen_count + 1,
        last_seen_at = now();

  update public.feed_posts
     set view_count = view_count + 1
   where id = any (p_posts) and status = 'published';
end;
$$;

grant execute on function public.feed_record_views(uuid[]) to authenticated;

-- The comment tree for one post, flattened in reading order: a parent
-- followed by its descendants, oldest first, so the client can render by
-- indenting on `depth` without doing tree assembly on the main thread.
create or replace function public.feed_comment_tree(p_post uuid, p_limit integer default 100)
returns table (
  id uuid,
  parent_id uuid,
  depth smallint,
  body text,
  image_url text,
  like_count integer,
  created_at timestamptz,
  author_id uuid,
  author_name text,
  author_username text,
  author_avatar_url text,
  is_demo boolean,
  viewer_liked boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with recursive thread as (
    select c.*, array[c.created_at, c.created_at] as path_sort, array[c.id] as path
    from public.feed_comments c
    where c.post_id = p_post and c.parent_id is null

    union all

    select c.*, parent.path_sort || c.created_at, parent.path || c.id
    from public.feed_comments c
    join thread parent on c.parent_id = parent.id
  )
  select
    t.id,
    t.parent_id,
    t.depth,
    t.body,
    t.image_url,
    t.like_count,
    t.created_at,
    t.author_id,
    coalesce(pr.full_name, t.author_name) as author_name,
    pr.username as author_username,
    coalesce(pr.avatar_url, t.author_avatar_url) as author_avatar_url,
    t.is_demo,
    exists (
      select 1 from public.feed_comment_likes cl
      where cl.comment_id = t.id and cl.user_id = auth.uid()
    ) as viewer_liked
  from thread t
  left join public.profiles pr on pr.id = t.author_id
  order by t.path_sort, t.path
  limit least(greatest(p_limit, 1), 400);
$$;

grant execute on function public.feed_comment_tree(uuid, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Authors
--
-- The contribution score. Deliberately weighted towards what other people
-- found useful rather than towards volume, so posting fifty times is worth
-- less than posting three things people saved.
-- ---------------------------------------------------------------------------

create or replace view public.feed_authors
with (security_invoker = true)
as
  select
    p.author_key,
    max(p.author_id::text)::uuid as author_id,
    (array_agg(coalesce(pr.full_name, p.author_name) order by p.published_at desc))[1] as name,
    (array_agg(p.author_role order by p.published_at desc))[1] as role,
    (array_agg(coalesce(pr.avatar_url, p.author_avatar_url) order by p.published_at desc))[1] as avatar_url,
    (array_agg(p.author_location order by p.published_at desc))[1] as location,
    bool_or(p.author_verified) as verified,
    bool_and(p.is_demo) as is_demo,
    count(*)::integer as post_count,
    sum(p.like_count)::integer as like_total,
    sum(p.comment_count)::integer as comment_total,
    sum(p.save_count)::integer as save_total,
    sum(p.download_count)::integer as download_total,
    (
      count(*) * 2
      + sum(p.like_count) * 1
      + sum(p.comment_count) * 3
      + sum(p.save_count) * 5
      + sum(p.download_count) * 2
    )::integer as contribution_score,
    (select count(*)::integer from public.feed_follows f where f.author_key = p.author_key)
      as follower_count,
    max(p.published_at) as last_post_at
  from public.feed_posts p
  left join public.profiles pr on pr.id = p.author_id
  where p.status = 'published'
  group by p.author_key;

comment on view public.feed_authors is
  'Per-author rollup for the feed, including the contribution score shown on profiles.';

grant select on public.feed_authors to anon, authenticated;

-- Who is worth following right now. Used by the "People to follow" rail.
create or replace function public.feed_suggested_authors(p_limit integer default 6)
returns table (
  author_key text,
  author_id uuid,
  name text,
  role text,
  avatar_url text,
  location text,
  verified boolean,
  post_count integer,
  follower_count integer,
  contribution_score integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    a.author_key, a.author_id, a.name, a.role, a.avatar_url, a.location,
    a.verified, a.post_count, a.follower_count, a.contribution_score
  from public.feed_authors a
  where not exists (
    select 1 from public.feed_follows f
    where f.author_key = a.author_key and f.follower_id = auth.uid()
  )
  order by a.contribution_score desc, a.last_post_at desc
  limit least(greatest(p_limit, 1), 20);
$$;

grant execute on function public.feed_suggested_authors(integer) to anon, authenticated;

-- Trending tags, for the discovery chips above the feed.
create or replace function public.feed_trending_tags(p_limit integer default 12)
returns table (tag text, post_count integer, engagement integer)
language sql
stable
security invoker
set search_path = public
as $$
  select
    t.tag,
    count(*)::integer as post_count,
    sum(p.like_count + p.comment_count * 2 + p.save_count * 3)::integer as engagement
  from public.feed_posts p
  cross join lateral unnest(p.tags) as t (tag)
  where p.status = 'published'
    and p.published_at > now() - interval '120 days'
  group by t.tag
  order by engagement desc, post_count desc
  limit least(greatest(p_limit, 1), 40);
$$;

grant execute on function public.feed_trending_tags(integer) to anon, authenticated;
