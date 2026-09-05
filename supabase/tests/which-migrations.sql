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
  (45, '0045_property_images',   'bucket', 'property-images'),
  (52, '0052_moderation',        'table',  'moderation_items'),
  (53, '0053_buildings',         'table',  'buildings'),
  (57, '0057_tours',             'table',  'tours'),
  (58, '0058_panorama_moderation','enumval','content_kind.panorama'),
  -- 0057 creates property_has_360 as well, so its existence proves nothing.
  -- 0059 is the version that also counts a published tour by the property's
  -- own owner, and that join is what is looked for.
  (59, '0059_has_360_union',     'body',   'property_has_360|t.owner_id = p.owner_id'),
  (60, '0060_scenes_review',     'column', 'tour_scenes.quarantine_path'),
  (61, '0061_floor_plans',       'table',  'floor_plans'),
  (62, '0062_tours_in_the_feed', 'column', 'tours.share_to_feed'),
  (63, '0063_account_restriction','column','profiles.restricted_until'),
  (64, '0064_admin_team',        'table',  'admin_members')
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
      when 'enumval' then exists (
        select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
        where t.typname = split_part(x.object, '.', 1)
          and e.enumlabel = split_part(x.object, '.', 2)
      )
      -- A function some later migration replaced in place. Its name proves
      -- nothing; the wording of the version wanted is what is looked for.
      when 'body' then exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = split_part(x.object, '|', 1)
          and pg_get_functiondef(p.oid) like '%' || split_part(x.object, '|', 2) || '%'
      )
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

-- ------------------------------------------------------------ administrators
--
-- After 0064, who runs the platform. The carry in that migration made every
-- existing admin a member with every area and the longest-standing of them the
-- owner, so this is where you confirm that landed on the right person.
--
-- Exactly one owner is the rule a unique index enforces. Zero means the carry
-- found nobody — no profile had is_admin — and the team page will not open for
-- anyone until one is set.
select
  coalesce(p.full_name, p.username, '(no name)') as person,
  case when m.is_owner then 'MAIN ADMINISTRATOR' else 'sub-administrator' end as role,
  case
    when m.is_owner then 'everything'
    else array_to_string(m.areas, ', ')
  end as may_touch
from public.admin_members m
left join public.profiles p on p.id = m.user_id
order by m.is_owner desc, m.created_at;

-- The two lists that must agree. profiles.is_admin is kept in step with
-- membership by a trigger, so a difference here means something wrote the flag
-- directly and the two have drifted.
select
  (select count(*) from public.admin_members) as administrators,
  (select count(*) from public.profiles where is_admin) as flagged,
  (select count(*) from public.admin_members where is_owner) as owners,
  case
    when (select count(*) from public.admin_members where is_owner) <> 1
      then '**there must be exactly one main administrator'
    when (select count(*) from public.admin_members)
       <> (select count(*) from public.profiles where is_admin)
      then '**the flag and the team have drifted apart'
    else '  in step'
  end as status;
