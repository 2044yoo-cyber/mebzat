-- Which migrations this database already has.
--
--   Paste into the Supabase SQL editor and run. Read-only: it creates nothing,
--   changes nothing, and is safe to run at any time.
--
-- Migrations here are plain SQL files with no version table, so "have I run
-- 0025?" has no direct answer. This asks the question a different way: it looks
-- for one object each migration is responsible for creating, and reports
-- whether it is there.
--
-- Written after a listing form failed with "Could not create that listing" for
-- three sessions. The cause was migration 0025, never applied, and the only
-- symptom anybody could see was a generic sentence. Running the migrations one
-- at a time to find out is slow and misleading — most of them are not
-- re-runnable, and answer `42710: policy ... already exists`, which looks like
-- a failure and means the opposite.

with expected (ordering, migration, kind, object) as (values
  (17, '0017_properties',        'type',   'property_type'),
  (22, '0022_location_privacy',  'column', 'properties.location_visibility'),
  (23, '0023_location_search',   'column', 'properties.street'),
  (25, '0025_listing_quality',   'type',   'seller_kind'),
  (26, '0026_feed',              'table',  'feed_posts'),
  (29, '0029_berchuma',          'type',   'design_visibility'),
  (32, '0032_jobs_enums',        'type',   'job_status'),
  (33, '0033_jobs',              'table',  'jobs'),
  (36, '0036_seed_registry',     'table',  'seed_content'),
  (37, '0037_plans_credits',     'table',  'credit_wallets'),
  (38, '0038_credit_functions',  'func',   'credits_reserve'),
  (39, '0039_payments',          'table',  'payments'),
  (40, '0040_medosha_ai_credits','column', 'credit_reservations.charged'),
  (41, '0041_material_price_book','table', 'material_prices'),
  (43, '0043_property_location', 'column', 'properties.is_sample'),
  (45, '0045_property_images',   'bucket', 'property-images')
)
select
  e.migration,
  case when present then '  APPLIED' else '**MISSING' end as status,
  e.kind || ' ' || e.object as looked_for
from (
  select
    x.*,
    case x.kind
      when 'type' then exists (select 1 from pg_type where typname = x.object)
      when 'table' then to_regclass('public.' || x.object) is not null
      when 'func' then exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = x.object
      )
      when 'column' then exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = split_part(x.object, '.', 1)
          and column_name = split_part(x.object, '.', 2)
      )
      when 'bucket' then exists (select 1 from storage.buckets where id = x.object)
    end as present
  from expected x
) e
order by e.ordering;

-- The seed rows, which are data rather than schema and so are asked separately.
select
  'demo properties' as item,
  count(*)::text as found,
  '50 expected after 0044' as note
from public.properties where is_sample
union all
select
  'material prices',
  count(*)::text,
  '455 expected after 0042'
from public.material_prices;
