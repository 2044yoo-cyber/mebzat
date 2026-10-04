-- ---------------------------------------------------------------------------
-- 0048 — the properties agent
--
-- Medosha AI can now answer about listings: "3 bedroom apartments in Bole",
-- "rentals under 50,000", "which properties are near CMC". Those turns are
-- logged like every other, and `ai_usage_logs.agent` is the `ai_agent` enum,
-- so the enum needs the value before a row can carry it.
--
-- ## Why this file adds the value and nothing else
--
-- `alter type ... add value` cannot be used in the same transaction that adds
-- it. Supabase runs each migration file in one transaction, so a file that
-- adds 'properties' and then writes it — in a default, a check, a backfill —
-- fails with "unsafe use of new value of enum type". It fails at apply time,
-- on the owner's machine, halfway through a deployment.
--
-- So this file does one thing. Anything that needs to *use* the value goes in
-- a later migration. There is nothing to add today: the column already exists
-- and already accepts whatever the enum holds.
--
-- ## Re-running this file
--
-- `if not exists` makes it idempotent, so applying it twice is a no-op rather
-- than a 42710. The other enums in this schema predate that clause; this one
-- does not need to.
-- ---------------------------------------------------------------------------

alter type public.ai_agent add value if not exists 'properties';

comment on type public.ai_agent is
  'Which Medosha AI specialism answered a turn. 0048 added ''properties'' for listings, rentals and agents.';
