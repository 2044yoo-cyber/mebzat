-- Berchuma Studio — enum extensions.
--
-- This file exists only to add values to enums, and it is separate for one
-- reason: PostgreSQL will not let a transaction use an enum value that the
-- same transaction added. Supabase runs each migration file in a transaction,
-- so a value added here and referenced in 0029 would fail with
--
--   unsafe use of new value "design" of enum type search_kind
--
-- Splitting the two is not tidiness. It is the only way this works.

-- `search_kind` drives the global search. A design is its own result type: it
-- is not a product, not a project, and not a post, and conflating it with any
-- of them would send people to the wrong page.
alter type public.search_kind add value if not exists 'design';

-- Three new things that can now happen to you.
--
-- Remix is the one that matters: somebody taking your design as a starting
-- point is the highest compliment this platform can pay, and it should reach
-- the original author rather than happening silently.
alter type public.notification_kind add value if not exists 'design_remix';
alter type public.notification_kind add value if not exists 'design_order';
alter type public.notification_kind add value if not exists 'template_purchase';
