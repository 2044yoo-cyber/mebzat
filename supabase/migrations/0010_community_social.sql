-- Phase 3: Community and the social graph.
--
-- Posts, comments, likes, hashtags, follows, and one unified notifications
-- table. Additive only — no existing table is altered.
--
-- Likes and comment counts are denormalised onto the post and maintained by
-- trigger. A feed sorts and pages on those counts, and a correlated subquery
-- per row is what makes a feed slow once it has any depth.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.post_kind as enum (
  'post',
  'question',
  'discussion',
  'tip',
  'showcase'
);

create type public.post_status as enum ('published', 'hidden', 'removed');

-- What is being followed. One table for all of them, because the feed and the
-- follower counts have to span the kinds and a table per kind would mean a
-- UNION in every query that does.
create type public.follow_target as enum ('profile', 'company', 'hashtag');

-- Everything that can reach a user's notification tray. Price events keep
-- their own table (0009) because they carry bid and listing columns that
-- nothing else uses; these are the general ones.
create type public.notification_kind as enum (
  'message',
  'follow',
  'post_like',
  'post_comment',
  'comment_reply',
  'mention',
  'review',
  'quote_request',
  'quote_received',
  'job_application',
  'event_reminder',
  'ai_alert',
  'system'
);

-- ---------------------------------------------------------------------------
-- posts
-- ---------------------------------------------------------------------------

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  -- Set when posting as a company rather than as yourself.
  company_id uuid references public.companies (id) on delete set null,

  kind public.post_kind not null default 'post',
  title text,
  body text not null check (length(body) between 1 and 20000),

  -- Optional context: a post can be about a project, a product or a company.
  context_type public.message_context,
  context_id uuid,

  -- Denormalised counters, maintained by trigger.
  like_count integer not null default 0,
  comment_count integer not null default 0,
  view_count integer not null default 0,

  -- A question is answered when its author accepts a comment.
  accepted_comment_id uuid,

  status public.post_status not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.posts is 'Community posts, questions and discussions.';

-- The feed: newest first, and the "top" sort by engagement.
create index posts_recent_idx
  on public.posts (created_at desc)
  where status = 'published';
create index posts_popular_idx
  on public.posts (like_count desc, created_at desc)
  where status = 'published';
create index posts_kind_idx
  on public.posts (kind, created_at desc)
  where status = 'published';
create index posts_author_idx on public.posts (author_id, created_at desc);
create index posts_company_idx on public.posts (company_id)
  where company_id is not null;
create index posts_context_idx on public.posts (context_type, context_id)
  where context_type is not null;

create index posts_search_idx
  on public.posts
  using gin (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(body, ''))
  );

create trigger posts_set_updated_at
  before update on public.posts
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- post_images
-- ---------------------------------------------------------------------------

create table public.post_images (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  url text not null,
  -- Set for video attachments; the UI picks a player on its presence.
  video_url text,
  alt text,
  position smallint not null default 0,
  created_at timestamptz not null default now()
);

create index post_images_post_idx on public.post_images (post_id, position);

-- ---------------------------------------------------------------------------
-- post_comments
-- Threaded one level: a reply points at its parent, and the UI does not nest
-- further. Deeper threads are harder to read on a phone and need recursion in
-- every query that renders them.
-- ---------------------------------------------------------------------------

create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  parent_id uuid references public.post_comments (id) on delete cascade,
  body text not null check (length(body) between 1 and 5000),
  like_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index post_comments_post_idx
  on public.post_comments (post_id, created_at);
create index post_comments_parent_idx on public.post_comments (parent_id)
  where parent_id is not null;
create index post_comments_author_idx on public.post_comments (author_id);

create trigger post_comments_set_updated_at
  before update on public.post_comments
  for each row
  execute function public.set_updated_at();

alter table public.posts
  add constraint posts_accepted_comment_fk
  foreign key (accepted_comment_id)
  references public.post_comments (id) on delete set null;

-- ---------------------------------------------------------------------------
-- post_likes
-- One row per (post, user). The primary key is the uniqueness constraint, so
-- liking twice is a no-op rather than a duplicate.
-- ---------------------------------------------------------------------------

create table public.post_likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index post_likes_user_idx on public.post_likes (user_id, created_at desc);

create table public.comment_likes (
  comment_id uuid not null references public.post_comments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

-- ---------------------------------------------------------------------------
-- hashtags
-- Stored as rows rather than a text[] on the post, so a tag page can be an
-- indexed lookup and a trending list can be one aggregate.
-- ---------------------------------------------------------------------------

create table public.hashtags (
  id uuid primary key default gen_random_uuid(),
  tag text not null unique check (tag = lower(tag) and tag !~ '\s'),
  post_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index hashtags_popular_idx on public.hashtags (post_count desc);

create table public.post_hashtags (
  post_id uuid not null references public.posts (id) on delete cascade,
  hashtag_id uuid not null references public.hashtags (id) on delete cascade,
  primary key (post_id, hashtag_id)
);

create index post_hashtags_tag_idx on public.post_hashtags (hashtag_id);

-- ---------------------------------------------------------------------------
-- follows
-- ---------------------------------------------------------------------------

create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  target_type public.follow_target not null,
  target_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (follower_id, target_type, target_id)
);

create index follows_target_idx on public.follows (target_type, target_id);
create index follows_follower_idx
  on public.follows (follower_id, created_at desc);

comment on table public.follows is
  'Who follows which profile, company or hashtag. target_id is not a foreign key because it spans three tables.';

-- ---------------------------------------------------------------------------
-- notifications
-- One tray for everything except price events, which keep their own shape.
-- ---------------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  kind public.notification_kind not null,
  title text not null,
  body text,
  -- Where clicking it should go. A path, not an id, so the tray does not need
  -- to know how to build a URL for every kind that will ever exist.
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx
  on public.notifications (user_id, created_at desc);
create index notifications_unread_idx
  on public.notifications (user_id)
  where read_at is null;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.posts enable row level security;
alter table public.post_images enable row level security;
alter table public.post_comments enable row level security;
alter table public.post_likes enable row level security;
alter table public.comment_likes enable row level security;
alter table public.hashtags enable row level security;
alter table public.post_hashtags enable row level security;
alter table public.follows enable row level security;
alter table public.notifications enable row level security;

create policy "Published posts are viewable by everyone"
  on public.posts for select
  to authenticated, anon
  using (status = 'published' or author_id = auth.uid());

create policy "Users write their own posts"
  on public.posts for insert
  to authenticated
  with check (author_id = auth.uid());

create policy "Authors update their own posts"
  on public.posts for update
  to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "Authors delete their own posts"
  on public.posts for delete
  to authenticated
  using (author_id = auth.uid());

create policy "Post images follow their post"
  on public.post_images for select
  to authenticated, anon
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_images.post_id
        and (p.status = 'published' or p.author_id = auth.uid())
    )
  );

create policy "Authors manage their post images"
  on public.post_images for all
  to authenticated
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_images.post_id and p.author_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.posts p
      where p.id = post_images.post_id and p.author_id = auth.uid()
    )
  );

create policy "Comments are viewable by everyone"
  on public.post_comments for select
  to authenticated, anon
  using (true);

create policy "Users write their own comments"
  on public.post_comments for insert
  to authenticated
  with check (author_id = auth.uid());

create policy "Authors update their own comments"
  on public.post_comments for update
  to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "Authors delete their own comments"
  on public.post_comments for delete
  to authenticated
  using (author_id = auth.uid());

create policy "Likes are viewable by everyone"
  on public.post_likes for select
  to authenticated, anon
  using (true);

create policy "Users manage their own likes"
  on public.post_likes for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Comment likes are viewable by everyone"
  on public.comment_likes for select
  to authenticated, anon
  using (true);

create policy "Users manage their own comment likes"
  on public.comment_likes for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Hashtags are viewable by everyone"
  on public.hashtags for select
  to authenticated, anon
  using (true);

create policy "Post hashtags are viewable by everyone"
  on public.post_hashtags for select
  to authenticated, anon
  using (true);

create policy "Authors tag their own posts"
  on public.post_hashtags for all
  to authenticated
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_hashtags.post_id and p.author_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.posts p
      where p.id = post_hashtags.post_id and p.author_id = auth.uid()
    )
  );

-- Follower counts are public; that is what makes them worth having.
create policy "Follows are viewable by everyone"
  on public.follows for select
  to authenticated, anon
  using (true);

create policy "Users manage their own follows"
  on public.follows for all
  to authenticated
  using (follower_id = auth.uid())
  with check (follower_id = auth.uid());

create policy "Users read their own notifications"
  on public.notifications for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users mark their own notifications read"
  on public.notifications for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Counter triggers
-- Counts are recomputed from the rows rather than incremented, so a double
-- fire or a cascade delete cannot leave a count that disagrees with reality.
-- ---------------------------------------------------------------------------

create function public.refresh_post_likes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.post_id, old.post_id);
begin
  update public.posts
  set like_count = (
    select count(*) from public.post_likes where post_id = target
  )
  where id = target;
  return coalesce(new, old);
end;
$$;

create trigger post_likes_refresh
  after insert or delete on public.post_likes
  for each row
  execute function public.refresh_post_likes();

create function public.refresh_post_comments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.post_id, old.post_id);
begin
  update public.posts
  set comment_count = (
    select count(*) from public.post_comments where post_id = target
  )
  where id = target;
  return coalesce(new, old);
end;
$$;

create trigger post_comments_refresh
  after insert or delete on public.post_comments
  for each row
  execute function public.refresh_post_comments();

create function public.refresh_comment_likes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.comment_id, old.comment_id);
begin
  update public.post_comments
  set like_count = (
    select count(*) from public.comment_likes where comment_id = target
  )
  where id = target;
  return coalesce(new, old);
end;
$$;

create trigger comment_likes_refresh
  after insert or delete on public.comment_likes
  for each row
  execute function public.refresh_comment_likes();

create function public.refresh_hashtag_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.hashtag_id, old.hashtag_id);
begin
  update public.hashtags
  set post_count = (
    select count(*) from public.post_hashtags where hashtag_id = target
  )
  where id = target;
  return coalesce(new, old);
end;
$$;

create trigger post_hashtags_refresh
  after insert or delete on public.post_hashtags
  for each row
  execute function public.refresh_hashtag_counts();

-- ---------------------------------------------------------------------------
-- Social notifications
-- The actor never notifies themselves — liking your own post should be quiet.
-- ---------------------------------------------------------------------------

create function public.notify_post_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  post public.posts;
  actor text;
begin
  select * into post from public.posts where id = new.post_id;
  if post.author_id = new.user_id then
    return new;
  end if;

  select coalesce(full_name, company_name, username, 'Someone')
  into actor from public.profiles where id = new.user_id;

  insert into public.notifications (user_id, actor_id, kind, title, body, href)
  values (
    post.author_id,
    new.user_id,
    'post_like',
    actor || ' liked your post',
    left(post.body, 120),
    '/community/' || post.id
  );
  return new;
end;
$$;

create trigger post_likes_notify
  after insert on public.post_likes
  for each row
  execute function public.notify_post_like();

create function public.notify_post_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  post public.posts;
  parent public.post_comments;
  actor text;
begin
  select coalesce(full_name, company_name, username, 'Someone')
  into actor from public.profiles where id = new.author_id;

  -- A reply notifies the comment it answers; a top-level comment notifies the
  -- post. Both, when the post author is also the parent commenter, would be
  -- two notifications for one action.
  if new.parent_id is not null then
    select * into parent from public.post_comments where id = new.parent_id;
    if parent.author_id <> new.author_id then
      insert into public.notifications (user_id, actor_id, kind, title, body, href)
      values (
        parent.author_id,
        new.author_id,
        'comment_reply',
        actor || ' replied to your comment',
        left(new.body, 120),
        '/community/' || new.post_id
      );
      return new;
    end if;
  end if;

  select * into post from public.posts where id = new.post_id;
  if post.author_id = new.author_id then
    return new;
  end if;

  insert into public.notifications (user_id, actor_id, kind, title, body, href)
  values (
    post.author_id,
    new.author_id,
    'post_comment',
    actor || ' commented on your post',
    left(new.body, 120),
    '/community/' || new.post_id
  );
  return new;
end;
$$;

create trigger post_comments_notify
  after insert on public.post_comments
  for each row
  execute function public.notify_post_comment();

create function public.notify_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text;
begin
  if new.target_type <> 'profile' then
    return new;
  end if;
  if new.target_id = new.follower_id then
    return new;
  end if;

  select coalesce(full_name, company_name, username, 'Someone')
  into actor from public.profiles where id = new.follower_id;

  insert into public.notifications (user_id, actor_id, kind, title, href)
  values (
    new.target_id,
    new.follower_id,
    'follow',
    actor || ' followed you',
    '/u/' || (select username from public.profiles where id = new.follower_id)
  );
  return new;
end;
$$;

create trigger follows_notify
  after insert on public.follows
  for each row
  execute function public.notify_follow();

-- ---------------------------------------------------------------------------
-- Hashtag extraction
-- Parses #tags out of the body on write, so a post and its tags cannot drift
-- apart and the client does not have to send them separately.
-- ---------------------------------------------------------------------------

create function public.sync_post_hashtags()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  found text;
  tag_id uuid;
begin
  delete from public.post_hashtags where post_id = new.id;

  for found in
    select distinct lower(match[1])
    from regexp_matches(
      coalesce(new.title, '') || ' ' || new.body,
      '#([A-Za-z0-9_]{2,50})',
      'g'
    ) as match
  loop
    insert into public.hashtags (tag) values (found)
    on conflict (tag) do nothing;

    select id into tag_id from public.hashtags where tag = found;
    insert into public.post_hashtags (post_id, hashtag_id)
    values (new.id, tag_id)
    on conflict do nothing;
  end loop;

  return new;
end;
$$;

create trigger posts_sync_hashtags
  after insert or update of title, body on public.posts
  for each row
  execute function public.sync_post_hashtags();

-- ---------------------------------------------------------------------------
-- Counters and helpers
-- ---------------------------------------------------------------------------

create function public.increment_post_views(target_post_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.posts set view_count = view_count + 1 where id = target_post_id;
$$;

/** Follower count for any target, so a profile or company page is one call. */
create function public.follower_count(
  target public.follow_target,
  target_uuid uuid
)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::bigint
  from public.follows
  where target_type = target and target_id = target_uuid;
$$;

/** Unread notification count for the header badge. */
create function public.unread_notification_count()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::bigint
  from public.notifications
  where user_id = auth.uid() and read_at is null;
$$;

/** Marks the tray read in one statement rather than a round trip per row. */
create function public.mark_notifications_read()
returns void
language sql
security definer
set search_path = public
as $$
  update public.notifications
  set read_at = now()
  where user_id = auth.uid() and read_at is null;
$$;

grant execute on function public.increment_post_views(uuid) to anon, authenticated;
grant execute on function public.follower_count(public.follow_target, uuid) to anon, authenticated;
grant execute on function public.unread_notification_count() to authenticated;
grant execute on function public.mark_notifications_read() to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.posts;
    alter publication supabase_realtime add table public.post_comments;
    alter publication supabase_realtime add table public.notifications;
  end if;
end
$$;
