-- A tour can be a post.
--
-- Likes, comments, saves, shares and views already exist and already work, on
-- feed_posts. A tour that wants them does not need a second set of any of it —
-- it needs a row in that table pointing back at itself. feed_posts already
-- carries entity_type and entity_id for exactly this, so there is no new
-- column to find the post by and no third place for a like to live.
--
-- What decides whether the post exists is the author's own choice, and it is
-- two separate questions that were being confused:
--
--   visibility   who may open the tour at all — published, or link-only
--   share_to_feed  whether it also appears in other people's feeds
--
-- An unlisted tour is reachable by anybody holding the link and appears in no
-- feed. A published tour is public; sharing it is still opt-in, because a
-- seller listing forty flats does not want forty posts.

alter type public.feed_kind add value if not exists 'tour_360';

alter table public.tours
  add column if not exists share_to_feed boolean not null default false;

comment on column public.tours.share_to_feed is
  'Whether a published tour also appears in the feed. Independent of visibility: '
  'an unlisted tour is never posted, and a published one only if the author asks.';

-- The post for a tour, found the way every other entity's is.
create index if not exists feed_posts_entity_idx
  on public.feed_posts (entity_type, entity_id)
  where entity_id is not null;
