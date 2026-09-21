-- What this database has, and who runs it.
--
--   Paste the whole file into the Supabase SQL editor and press Run. It
--   changes no table, no policy and no row of yours: the only thing it
--   creates is a scratch list that lives for the length of the query.
--
-- Migrations here are plain SQL files with no version table, so "have I run
-- 0025?" has no direct answer. This asks the question a different way: it
-- looks for one object each migration is responsible for creating, and reports
-- whether it is there.
--
-- Written after a listing form failed with "Could not create that listing" for
-- three sessions. The cause was migration 0025, never applied, and the only
-- symptom anybody could see was a generic sentence. Running the migrations one
-- at a time to find out is slow and misleading — most of them are not
-- re-runnable, and answer `42710: policy ... already exists`, which looks like
-- a failure and means the opposite.
--
-- ## Why it is built up in a scratch list rather than written as one query
--
-- Two reasons, both learned the hard way.
--
-- The SQL editor shows the result of the *last* statement only. Four selects
-- in a file means three of them are run and thrown away, and somebody reads a
-- clean summary while the missing-migration list they needed scrolled past
-- unseen. So there is one result, and everything is in it.
--
-- And a plain query naming public.properties cannot run on a database that has
-- no such table — the parser refuses it before any row is read, so one absent
-- table takes the whole report down and reports nothing about the twenty
-- objects that are fine. The counts are gathered through dynamic SQL, which is
-- only resolved for tables that turn out to exist.

drop table if exists which_migrations_report;
create temporary table which_migrations_report (
  ordering int,
  section text,
  item text,
  status text,
  detail text
);

do $report$
declare
  row record;
  present boolean;
  found bigint;
begin

  -- ------------------------------------------------------------- the schema
  --
  -- One object per migration. The kind says how to look for it, because
  -- "is it there" is a different question for a table, a column, a value
  -- inside an enum, and a function some later migration rewrote in place.
  for row in
    select * from (values
      (17, '0017_properties',         'type',    'property_type'),
      (22, '0022_location_privacy',   'column',  'properties.location_visibility'),
      (23, '0023_location_search',    'column',  'properties.street'),
      (25, '0025_listing_quality',    'type',    'seller_kind'),
      (26, '0026_feed',               'table',   'feed_posts'),
      (29, '0029_berchuma',           'type',    'design_visibility'),
      (32, '0032_jobs_enums',         'type',    'job_status'),
      (33, '0033_jobs',               'table',   'jobs'),
      (36, '0036_seed_registry',      'table',   'seed_content'),
      (37, '0037_plans_credits',      'table',   'credit_wallets'),
      (38, '0038_credit_functions',   'func',    'credits_reserve'),
      (39, '0039_payments',           'table',   'payments'),
      (40, '0040_medosha_ai_credits', 'column',  'credit_reservations.charged'),
      (41, '0041_material_price_book','table',   'material_prices'),
      (43, '0043_property_location',  'column',  'properties.is_sample'),
      (45, '0045_property_images',    'bucket',  'property-images'),
      (52, '0052_moderation',         'table',   'moderation_items'),
      (53, '0053_buildings',          'table',   'buildings'),
      (57, '0057_tours',              'table',   'tours'),
      (58, '0058_panorama_moderation','enumval', 'content_kind.panorama'),
      -- 0057 creates property_has_360 as well, so its existence proves
      -- nothing. 0059 is the version that also counts a published tour by the
      -- property's own owner, and that join is what is looked for.
      (59, '0059_has_360_union',      'body',    'property_has_360|t.owner_id = p.owner_id'),
      (60, '0060_scenes_review',      'column',  'tour_scenes.quarantine_path'),
      (61, '0061_floor_plans',        'table',   'floor_plans'),
      (62, '0062_tours_in_the_feed',  'column',  'tours.share_to_feed'),
      (63, '0063_account_restriction','column',  'profiles.restricted_until'),
      (64, '0064_admin_team',         'table',   'admin_members'),
      -- `feed_page` existed before 0065; the migration rewrote it and added
      -- `p_seed`. Same for 0076's and 0079's objects further down — a name
      -- that predates the migration is not evidence the migration ran, and
      -- all three reported APPLIED on a database that had never seen them.
      (65, '0065_feed_discovery',     'body',    'feed_page|p_seed'),
      (66, '0066_buildings_viewport', 'func',    'buildings_in_viewport'),
      (67, '0067_saved_calculations', 'table',   'saved_calculations'),
      (68, '0068_verification',       'func',    'sync_phone_verification'),
      (69, '0069_image_watermarks',   'table',   'watermark_settings'),
      -- 0070 adds one value to an enum and nothing else, so the value is the
      -- only thing that can be looked for.
      (70, '0070_infringement',       'enumval', 'moderation_category.infringement'),
      (71, '0071_professional_prof',  'func',    'professional_reputation'),
      (72, '0072_company_profile',    'func',    'refresh_company_aggregates'),
      (73, '0073_professional_search','func',    'search_professionals'),
      (74, '0074_used_items',         'type',    'product_condition'),
      (75, '0075_digital_products',   'type',    'digital_kind'),
      (76, '0076_review_after_post',  'func',    'moderation_hide_threshold'),
      (77, '0077_project_categories', 'type',    'project_category'),
      (78, '0078_service_areas',      'table',   'location_areas'),
      (79, '0079_job_area_matching',  'column',  'project_briefs.location_area'),
      (80, '0080_project_prof_links', 'func',    'enforce_project_company_claim'),
      (81, '0081_panorama_capture',   'table',   'panorama_jobs'),
      (82, '0082_panorama_stage',     'column',  'panorama_jobs.stage'),
      (83, '0083_panorama_poses',     'column',  'panorama_jobs.frames'),
      -- 0084 and 0085 create no object: one seeds people, the other seeds
      -- places. A row is the only evidence either ran, so a row is what is
      -- looked for — and both are idempotent, so a missing one is safe to
      -- apply again.
      (84, '0084_professionals_seed', 'row',     'seed_content|batch = ''professionals-2026-09'''),
      (85, '0085_places',             'row',     'location_areas|slug = ''ayertena'''),
      (86, '0086_profile_documents',  'column',  'profiles.cv_path'),
      -- `notifications` predates 0087; `entity_type` is what it added, and it
      -- is what the message-to-notification link is keyed on.
      (87, '0087_message_notifications','column', 'notifications.entity_type'),
      (88, '0088_blocks_and_reports', 'table',   'user_blocks'),
      -- Agenda's tables are all prefixed `agenda_` and several migrations
      -- mention each other's, so the object looked for is the one each file
      -- creates rather than the first name that matches the prefix.
      (89, '0089_agenda_projects',    'table',   'agenda_projects'),
      (90, '0090_agenda_site',        'table',   'agenda_rfis'),
      -- 0091 created `agenda_can_view_contracts`, which 0024 named as a
      -- permission and never gave a reader.
      (91, '0091_agenda_commercial',  'func',    'agenda_can_view_contracts'),
      (92, '0092_agenda_numbering',   'func',    'agenda_next_number'),
      (93, '0093_agenda_submittal_current', 'func', 'agenda_submittal_set_current'),
      (94, '0094_agenda_files',       'bucket',  'agenda-files'),
      -- 0095 creates nothing: it drops a not-null and adds a check. The
      -- constraint is the only evidence it ran.
      (95, '0095_agenda_panorama_photos', 'constraint',
           'agenda_photos.agenda_photos_has_an_image'),
      -- 0096 creates nothing at all: it takes a grant away. The evidence is
      -- that `anon` no longer holds it.
      (96, '0096_agenda_permission_grants', 'grant',
           'agenda_is_member(uuid)|anon|no'),
      -- 0097 adds the role enum and two profile tables. The enum is the
      -- sentinel: the tables are named in 0099's comments as well, and a
      -- sentinel that something else mentions is a sentinel that can be found
      -- without the migration having run.
      (97, '0097_account_roles',      'type',    'medosha_role'),
      (98, '0098_profession_details', 'column',  'profiles.profession_details'),
      -- 0099 creates nothing. It replaces `search_professionals` with the same
      -- signature, so the function exists either way and only its body says
      -- whether the replacement happened.
      (99, '0099_professional_search_roles', 'body',
           'search_professionals|p.roles &&'),
      -- 0100 adds nothing new. It re-asks for the columns the profile form
      -- writes, so a database that stopped part-way through an earlier
      -- migration has them — which means every column it adds is also added
      -- somewhere else, and no column can tell whether *this* file ran. Its
      -- comment on `company_size` can: 0086 adds that column and does not
      -- comment on it.
      (100, '0100_profile_form_columns', 'comment',
           'profiles.company_size|Re-asserted by 0100')
    ) as t (ordering, migration, kind, object)
  loop
    present := case row.kind
      when 'type' then exists (select 1 from pg_type where typname = row.object)
      when 'table' then to_regclass('public.' || row.object) is not null
      when 'func' then exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = row.object
      )
      when 'column' then exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = split_part(row.object, '.', 1)
          and column_name = split_part(row.object, '.', 2)
      )
      -- 'row' is handled after the case, not in it: it needs dynamic SQL, and
      -- the reason is in this file's header — a query naming a table that does
      -- not exist is refused by the parser before a row is read, so one absent
      -- table would take the whole report down.
      when 'row' then null
      when 'bucket' then exists (select 1 from storage.buckets where id = row.object)
      when 'enumval' then exists (
        select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
        where t.typname = split_part(row.object, '.', 1)
          and e.enumlabel = split_part(row.object, '.', 2)
      )
      -- A migration that only changes who may call a function has nothing to
      -- look for but the privilege itself. `object` is `<function>|<role>|
      -- <yes or no>`: whether that role should hold execute on it.
      when 'grant' then (
        has_function_privilege(
          split_part(row.object, '|', 2),
          'public.' || split_part(row.object, '|', 1),
          'execute')
        = (split_part(row.object, '|', 3) = 'yes')
      )
      -- A migration that creates nothing and only relaxes a column has a
      -- named constraint as the one object that can be looked for.
      when 'constraint' then exists (
        select 1 from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        join pg_namespace n on n.oid = t.relnamespace
        where n.nspname = 'public'
          and t.relname = split_part(row.object, '.', 1)
          and c.conname = split_part(row.object, '.', 2)
      )
      -- A migration that only re-asserts what other migrations created has no
      -- object of its own to look for. A comment it leaves behind is the one
      -- thing that is unambiguously its.
      when 'comment' then coalesce(
        col_description(
          to_regclass('public.' || split_part(split_part(row.object, '|', 1), '.', 1)),
          (select attnum from pg_attribute
           where attrelid = to_regclass('public.' || split_part(split_part(row.object, '|', 1), '.', 1))
             and attname = split_part(split_part(row.object, '|', 1), '.', 2)
             and not attisdropped)
        ) like '%' || split_part(row.object, '|', 2) || '%',
        false)
      when 'body' then exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = split_part(row.object, '|', 1)
          and pg_get_functiondef(p.oid) like '%' || split_part(row.object, '|', 2) || '%'
      )
    end;

    -- The dynamic half. `present` is null for a 'row' check because the table
    -- name is only known at run time and a plain query naming a table that
    -- does not exist is refused by the parser — the whole reason this report
    -- is built up in a loop rather than written as one select.
    if row.kind = 'row' then
      if to_regclass('public.' || split_part(row.object, '|', 1)) is null then
        present := false;
      else
        execute format(
          'select exists (select 1 from public.%I where %s)',
          split_part(row.object, '|', 1),
          split_part(row.object, '|', 2)
        ) into present;
      end if;
    end if;

    insert into which_migrations_report values (
      row.ordering,
      'migrations',
      row.migration,
      case when present then 'APPLIED' else '** MISSING' end,
      'looked for ' || row.kind || ' ' || row.object
    );
  end loop;

  -- --------------------------------------------------------------- the seeds
  --
  -- Data rather than schema, so asked separately: a migration can have run and
  -- still have inserted nothing if it was edited or interrupted.
  --
  -- Broken down rather than totalled, because the total is not a number
  -- anybody can check. This row said "50 expected after 0044" and reported 357
  -- on a healthy database — 0044's fifty sales, 0047's hundred rentals, and
  -- however many units scripts/seed_buildings.ts has put inside its buildings.
  --
  -- The first attempt at breaking it up was worse than the total: the parts
  -- came to 362 against a total of 357, because scripts/demo_building.ts moves
  -- five existing demo listings into "Sunrise Apartments (demo)" rather than
  -- inventing new ones, so those five were counted as demo listings and again
  -- as units in a building. Parts that do not add up send somebody hunting for
  -- a fault that is not there — exactly what the row was rewritten to stop.
  --
  -- So the groups below are disjoint, and the total row checks them.
  if to_regclass('public.properties') is not null then
    declare
      registered boolean := to_regclass('public.seed_content') is not null;
      grouped boolean := exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'properties'
          and column_name = 'building_id');
      sale bigint := 0;
      rent bigint := 0;
      units bigint := 0;
      loose bigint := 0;
      moved bigint := 0;
      total bigint := 0;
    begin
      execute 'select count(*) from public.properties where is_sample' into total;

      if registered then
        execute $q$select count(*) from public.properties p
                 where p.is_sample and exists (
                   select 1 from public.seed_content s
                   where s.entity = 'properties' and s.entity_id = p.id
                     and s.batch = 'property-demo-2026-08')$q$ into sale;
        execute $q$select count(*) from public.properties p
                 where p.is_sample and exists (
                   select 1 from public.seed_content s
                   where s.entity = 'properties' and s.entity_id = p.id
                     and s.batch = 'rental-demo-2026-08')$q$ into rent;

        insert into which_migrations_report values (
          100, 'seed data', 'demo properties for sale', sale::text, '50 after 0044');
        insert into which_migrations_report values (
          101, 'seed data', 'demo properties to rent', rent::text, '100 after 0047');
      end if;

      -- Units seed_buildings.ts created. Registered demo listings are excluded
      -- because demo_building.ts moves some of them into a building, and a row
      -- counted in two groups is what made the parts overshoot the total.
      if grouped then
        execute $q$select count(*) from public.properties p
                 where p.is_sample and p.building_id is not null $q$
                 || case when registered then $q$and not exists (
                      select 1 from public.seed_content s
                      where s.entity = 'properties' and s.entity_id = p.id)$q$
                    else '' end
          into units;

        insert into which_migrations_report values (
          102, 'seed data', 'demo units in buildings', units::text,
          'however many seed_buildings.ts made');

        if registered then
          execute $q$select count(*) from public.properties p
                   where p.is_sample and p.building_id is not null and exists (
                     select 1 from public.seed_content s
                     where s.entity = 'properties' and s.entity_id = p.id)$q$
            into moved;

          insert into which_migrations_report values (
            103, 'seed data', 'of those, demo listings moved indoors', moved::text,
            'demo_building.ts puts existing listings in a building, counted above');
        end if;
      end if;

      -- Counted, not inferred. `total - sale - rent - units` would make the
      -- check below an identity that holds however wrong the groups are: an
      -- overlap would quietly come out as a negative remainder and the sum
      -- would still balance. Asking the table what is left over is what lets
      -- the groups overshoot and be caught.
      execute 'select count(*) from public.properties p where p.is_sample'
              || case when grouped then ' and p.building_id is null' else '' end
              || case when registered then $q$ and not exists (
                   select 1 from public.seed_content s
                   where s.entity = 'properties' and s.entity_id = p.id)$q$
                 else '' end
        into loose;

      insert into which_migrations_report values (
        104, 'seed data', 'other sample rows', loose::text,
        'not from a migration or a building — seeded by hand');

      insert into which_migrations_report values (
        105, 'seed data', 'sample properties, all told', total::text,
        case
          when sale + rent + units + loose = total
            then 'the groups above, which do not overlap'
          else '** the groups above do not add up to this'
        end);

      execute 'select count(*) from public.properties where not is_sample' into total;
      insert into which_migrations_report values (
        106, 'seed data', 'real listings', total::text, 'posted by actual sellers');
    end;
  end if;

  -- ------------------------------------------------------- the control room
  --
  -- After 0064, who runs the platform. The carry in that migration made every
  -- existing administrator a member with every area, and the longest-standing
  -- of them the owner — so this is where you confirm that landed on the right
  -- person. If it did not, supabase/tools/main-administrator.sql moves it.
  if to_regclass('public.admin_members') is null then
    insert into which_migrations_report values (
      200, 'administrators', '(none yet)', '** MISSING',
      'apply 0064 — until then nobody can open /admin/team');
  elsif not exists (select 1 from public.admin_members) then
    -- Not damage, and not 0064 failing. Nothing in any migration sets
    -- profiles.is_admin, so a Medosha that has never had an administrator has
    -- nobody for 0064's carry to carry, and set_admin_member cannot appoint
    -- the first because it refuses anybody who is not already the owner.
    insert into which_migrations_report values (
      200, 'administrators', 'nobody yet', '** NOT APPOINTED',
      'expected on a database that has never had one — run supabase/tools/main-administrator.sql');
  else
    for row in
      execute $q$
        select
          coalesce(p.full_name, p.username, '(no name)') as person,
          coalesce(p.username, '') as handle,
          m.is_owner,
          coalesce(array_to_string(m.areas, ', '), '') as areas
        from public.admin_members m
        left join public.profiles p on p.id = m.user_id
        order by m.is_owner desc, m.created_at
      $q$
    loop
      insert into which_migrations_report values (
        case when row.is_owner then 200 else 201 end,
        'administrators',
        row.person || case when row.handle = '' then '' else ' (@' || row.handle || ')' end,
        case when row.is_owner then 'MAIN ADMINISTRATOR' else 'sub-administrator' end,
        case when row.is_owner then 'everything' else row.areas end
      );
    end loop;
  end if;

  -- The two lists that must agree, counted outside the branch above. Putting
  -- this inside the "there are administrators" arm is how the summary line
  -- vanished from the one report that most needed it: the empty database.
  if to_regclass('public.admin_members') is not null then
    declare
      members bigint;
      flagged bigint;
      owners bigint;
    begin
      execute 'select count(*) from public.admin_members' into members;
      execute 'select count(*) from public.admin_members where is_owner' into owners;
      execute 'select count(*) from public.profiles where is_admin' into flagged;

      insert into which_migrations_report values (
        300, 'summary', 'administrators',
        case
          when members = 0 and flagged = 0
            then '** nobody is an administrator yet — appoint one'
          when owners <> 1 then '** there must be exactly one main administrator'
          when members <> flagged then '** the flag and the team have drifted apart'
          else 'in step'
        end,
        members || ' on the team, ' || flagged || ' flagged, ' || owners || ' main'
      );
    end;
  end if;

  insert into which_migrations_report values (
    301, 'summary', 'migrations',
    case
      when exists (select 1 from which_migrations_report
                   where section = 'migrations' and status like '**%')
        then '** something is missing — see the rows above'
      else 'all applied'
    end,
    (select count(*)::text from which_migrations_report where section = 'migrations')
      || ' checked'
  );
end
$report$;

select section, item, status, detail
from which_migrations_report
order by ordering, item;
