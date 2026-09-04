-- A panorama is moderated like every other upload.
--
-- 360° content goes through the same quarantine → check → publish path as an
-- avatar or a product photo: the file lands in `moderation-quarantine`, which
-- is private and folder-scoped to the uploader, and only reaches the public
-- `panoramas` bucket once a verdict of `safe` comes back.
--
-- All this migration adds is a name for it in the queue. A moderator looking
-- at a flagged item should be able to see that it is a room in a tour rather
-- than a product photo, because what a reasonable panorama looks like is not
-- what a reasonable product photo looks like. Filing them under an existing
-- kind would have saved this file and cost that.
--
-- ALTER TYPE ... ADD VALUE is additive: no existing row changes, no existing
-- value moves, and nothing that reads content_kind today has to know.

alter type public.content_kind add value if not exists 'panorama';
