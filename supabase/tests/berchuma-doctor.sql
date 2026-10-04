-- Berchuma Studio — what is actually in this database.
--
-- Paste this into the Supabase SQL editor and run it. It changes nothing; it
-- lists every object the Berchuma migrations create and says whether it is
-- there, then tells you which file to run next.
--
-- Why this exists: the SQL editor does not wrap a pasted file in a
-- transaction, so a migration that fails halfway leaves half of itself behind.
-- `designs` is created on line 49 of 0029 and `manufacturing_requests` on line
-- 213 — a failure between the two leaves a database where the studio appears
-- to work and quote requests fail with "relation does not exist", which reads
-- like a bug in 0031 and is not one.

with expected (migration, kind, name) as (
  values
    ('0028_berchuma_enums.sql', 'enum value', 'search_kind.design'),
    ('0028_berchuma_enums.sql', 'enum value', 'notification_kind.design_remix'),
    ('0028_berchuma_enums.sql', 'enum value', 'notification_kind.design_order'),
    ('0028_berchuma_enums.sql', 'enum value', 'notification_kind.template_purchase'),

    ('0029_berchuma.sql', 'table', 'designs'),
    ('0029_berchuma.sql', 'table', 'design_versions'),
    ('0029_berchuma.sql', 'table', 'design_assets'),
    ('0029_berchuma.sql', 'table', 'design_conversations'),
    ('0029_berchuma.sql', 'table', 'manufacturing_requests'),
    ('0029_berchuma.sql', 'table', 'template_grants'),
    ('0029_berchuma.sql', 'function', 'design_slug'),
    ('0029_berchuma.sql', 'function', 'berchuma_remix'),
    ('0029_berchuma.sql', 'function', 'berchuma_record_view'),
    ('0029_berchuma.sql', 'function', 'search_designs'),
    ('0029_berchuma.sql', 'function', 'public_designs'),

    ('0030_berchuma_publish.sql', 'index', 'feed_posts_one_per_design'),

    ('0031_berchuma_quotes.sql', 'index', 'manufacturing_requests_one_open'),
    ('0031_berchuma_quotes.sql', 'function', 'berchuma_request_quote'),
    ('0031_berchuma_quotes.sql', 'function', 'berchuma_workshops')
),
present as (
  select
    e.migration,
    e.kind,
    e.name,
    case e.kind
      when 'table' then to_regclass('public.' || e.name) is not null
      when 'index' then to_regclass('public.' || e.name) is not null
      when 'function' then exists (
        select 1 from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = e.name
      )
      when 'enum value' then exists (
        select 1 from pg_enum en
        join pg_type t on t.oid = en.enumtypid
        where t.typname = split_part(e.name, '.', 1)
          and en.enumlabel = split_part(e.name, '.', 2)
      )
      else false
    end as found
  from expected e
)
select
  case when found then '  ok' else '✗ MISSING' end as status,
  migration,
  kind,
  name
from present
order by found, migration, kind, name;

-- ---------------------------------------------------------------------------
-- What to do about it
-- ---------------------------------------------------------------------------

with expected (migration, kind, name) as (
  values
    ('0028_berchuma_enums.sql', 'enum value', 'search_kind.design'),
    ('0029_berchuma.sql', 'table', 'designs'),
    ('0029_berchuma.sql', 'table', 'manufacturing_requests'),
    ('0029_berchuma.sql', 'function', 'berchuma_remix'),
    ('0030_berchuma_publish.sql', 'index', 'feed_posts_one_per_design'),
    ('0031_berchuma_quotes.sql', 'function', 'berchuma_request_quote')
),
present as (
  select
    e.migration,
    case e.kind
      when 'table' then to_regclass('public.' || e.name) is not null
      when 'index' then to_regclass('public.' || e.name) is not null
      when 'function' then exists (
        select 1 from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = e.name
      )
      when 'enum value' then exists (
        select 1 from pg_enum en
        join pg_type t on t.oid = en.enumtypid
        where t.typname = split_part(e.name, '.', 1)
          and en.enumlabel = split_part(e.name, '.', 2)
      )
      else false
    end as found
  from expected e
),
incomplete as (
  select migration
  from present
  group by migration
  having bool_and(found) is false
)
select
  case
    when not exists (select 1 from incomplete)
      then 'Everything is applied. Nothing to run.'
    else
      'Run these in this order, each as its own query: ' ||
      string_agg(migration, ' then ' order by migration)
  end as next_step
from incomplete;
