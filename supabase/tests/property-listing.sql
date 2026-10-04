-- Creating a listing, end to end, as the form does.
--
-- Written after "Could not create that listing" turned out to mean "migration
-- 0025 was never applied". The insert names columns from four migrations, so a
-- chain with a hole in it fails here rather than in front of a seller who has
-- just filled in six steps.
--
-- Runs as `authenticated`: as superuser every policy reports that it works.
--
--   psql -f supabase/tests/property-listing.sql

begin;
insert into auth.users (id, email) values ('f1000000-0000-4000-8000-000000000001','agent2@example.test');
update public.profiles set full_name='Test Agent', username='test-agent'
 where id='f1000000-0000-4000-8000-000000000001';

set local role authenticated;
set local request.jwt.claim.sub = 'f1000000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';

-- Two statements, as the server action does. A data-modifying CTE would not
-- work here: its new row is invisible to the RLS policy's sub-select in the
-- same statement, so the media insert would be refused for a property that
-- does exist.
insert into public.properties (
  owner_id, title, slug, property_type, listing_kind, price, price_period,
  location_city, latitude, longitude, seller_kind, preferred_contact,
  location_visibility, privacy_radius_m, status
) values (
  'f1000000-0000-4000-8000-000000000001','bole','bole','apartment','rent',120000,'month',
  'Addis Ababa', 9.01, 38.78, 'agent', 'call', 'approximate', 50, 'available'
);

insert into public.property_media (property_id, kind, url, position, width, height, size_bytes)
select id, 'photo', 'https://x.supabase.co/storage/v1/object/public/property-images/f1000000/draft/0.webp', 0, 1600, 1200, 240000
from public.properties where title='bole';

select 'listing inserted'   as test, count(*)::text  from public.properties where title='bole'
union all select 'property type stored', property_type::text from public.properties where title='bole'
union all select 'rent/sale correct',    listing_kind::text  from public.properties where title='bole'
union all select 'price correct',        price::text         from public.properties where title='bole'
union all select 'photo attached',       count(*)::text      from public.property_media m join public.properties p on p.id=m.property_id where p.title='bole'
union all select 'coordinates saved',    latitude||', '||longitude from public.properties where title='bole'
union all select 'display point set',    round(display_latitude::numeric,4)||', '||round(display_longitude::numeric,4) from public.properties where title='bole'
union all select 'privacy radius kept',  privacy_radius_m::text  from public.properties where title='bole'
union all select 'ownership correct',    (owner_id='f1000000-0000-4000-8000-000000000001')::text from public.properties where title='bole'
union all select 'not marked demo',      is_sample::text     from public.properties where title='bole'
union all select 'appears on the map',   count(*)::text from public.properties_in_viewport(8.8,38.5,9.2,39.1) where title='bole'
union all select 'agent name on marker', coalesce(agent_name,'(none)') from public.properties_in_viewport(8.8,38.5,9.2,39.1) where title='bole'
union all select 'detail page can read', title from public.properties where title='bole';
rollback;
