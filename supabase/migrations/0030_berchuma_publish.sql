-- Berchuma Studio — publishing.
--
-- Almost nothing is needed here, and that is the point. Saving a design,
-- writing a version, publishing it and posting it to the feed all pass the
-- policies that already exist: `designs_insert` accepts a row owned by the
-- caller, `design_versions_write` accepts a version of a design they own, and
-- `feed_posts_write` accepts a post they author. Berchuma does not get its own
-- feed, its own posting path or its own permission model — it uses Medosha's.
--
-- One thing is missing, and it is the thing a retry breaks.

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------
--
-- The Supabase SQL editor does not wrap a pasted file in a transaction, so a
-- migration that fails halfway leaves half of itself behind and the next one
-- fails on a missing object with no hint about which file is actually absent.
-- "relation public.designs does not exist" reads like a bug in this file; it
-- means 0029 never finished.
--
-- Run supabase/tests/berchuma-doctor.sql to see exactly what is present.
-- ---------------------------------------------------------------------------
-- All of this file, or none of it.
-- ---------------------------------------------------------------------------
--
-- The Supabase SQL editor does not stop at the first error — it runs every
-- statement in what you pasted and reports the failures afterwards. A file
-- that fails halfway therefore leaves half of itself behind, and the next
-- migration fails on a missing object with no hint about which file is
-- actually absent. That is how a database ends up with `designs` but not
-- `manufacturing_requests`.
--
-- An explicit transaction fixes it properly: the first error aborts, every
-- later statement is refused, and nothing is committed. Re-running after the
-- cause is fixed then starts from a clean state rather than from a mess.
--
-- PostgreSQL runs DDL inside transactions, so this is safe for every statement
-- below. It is not safe for `alter type ... add value`, which is why the enum
-- additions live in 0028 and are not wrapped.
begin;

do $$
begin
  if to_regclass('public.designs') is null then
    raise exception using
      message = 'Berchuma: public.designs does not exist, so the design feed index cannot be created.',
      hint = 'Apply 0028_berchuma_enums.sql and then 0029_berchuma.sql first, then run this file again. Run supabase/tests/berchuma-doctor.sql to see what is missing.';
  end if;

  if to_regclass('public.feed_posts') is null then
    raise exception using
      message = 'Berchuma: public.feed_posts does not exist, so the design feed index cannot be created.',
      hint = 'Apply 0026_feed.sql first, then run this file again. Run supabase/tests/berchuma-doctor.sql to see what is missing.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- One design, one feed post
-- ---------------------------------------------------------------------------
--
-- Publishing is two writes: the design becomes public, and a card appears in
-- the feed. Pressing publish twice — or a client retrying after a timeout it
-- could not tell from a failure — would put the same wardrobe in the feed
-- twice, and the second card would collect its own likes and comments while
-- pointing at the same design.
--
-- Enforced in the database rather than by checking first and inserting after,
-- because that check-then-act is a race the moment two requests arrive
-- together. The application inserts with `on conflict do nothing` and treats
-- "already there" as success, which is what publishing an already-published
-- design should mean.
--
-- Scoped to design posts by the partial predicate: every other entity type on
-- the feed is free to have as many cards as it likes.
create unique index if not exists feed_posts_one_per_design
  on public.feed_posts (entity_id)
  where entity_type = 'design' and entity_id is not null;

comment on index public.feed_posts_one_per_design is
  'A design appears on the feed once. Publishing is idempotent because of this index, not because the application remembers.';

commit;
