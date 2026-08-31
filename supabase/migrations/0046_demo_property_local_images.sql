-- Point the demo listings at images this application can actually render.
--
-- 0044 carried the dataset's own placeholder, an `images.unsplash.com` URL.
-- `next.config.ts` allows exactly one remote host — this deployment's Supabase
-- Storage — and states the reason: all demo imagery is local so the app renders
-- fully offline.
--
-- The failure was not a missing thumbnail. `next/image` throws on an
-- unconfigured host, and a throw inside a client component takes the route with
-- it, so the property map came up as "The map could not start" and took the
-- listings, the filters and the search with it.
--
-- 0044 was regenerated to emit local paths, but it is idempotent by design and
-- will not touch rows it already inserted. This is the repair for a database
-- that has already run it.
--
-- Scoped to `is_sample` rows, so nothing a real seller uploaded is altered.
--
-- Safe to run more than once, and safe to run on a database that never had the
-- bad URLs: it matches on the host, so it changes nothing when there is nothing
-- to change.
--
-- Additive. Run after 0045.

begin;

do $$
begin
  if to_regclass('public.properties') is null
     or not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'properties'
         and column_name = 'is_sample'
     ) then
    raise exception using
      message = 'Demo image repair: the sample-data columns are missing.',
      hint = 'Run migration 0043 first.';
  end if;
end $$;

update public.properties
set cover_image_url = case property_type
  when 'apartment'  then '/images/projects/residential.svg'
  when 'villa'      then '/images/projects/residential.svg'
  when 'house'      then '/images/projects/residential.svg'
  when 'commercial' then '/images/projects/commercial.svg'
  when 'office'     then '/images/projects/commercial.svg'
  when 'shop'       then '/images/projects/commercial.svg'
  when 'warehouse'  then '/images/projects/industrial.svg'
  when 'land'       then '/images/projects/landscape.svg'
  else '/images/placeholders/project.svg'
end
where is_sample
  and cover_image_url is not null
  and cover_image_url not like '/%';

-- Media rows too, for the same reason and on the same terms. None exist today —
-- 0044 writes no photos — but a later demo batch might, and a repair that
-- covered only half the problem would be worse than none.
update public.property_media m
set url = '/images/placeholders/project.svg'
from public.properties p
where p.id = m.property_id
  and p.is_sample
  and m.url not like '/%';

commit;
