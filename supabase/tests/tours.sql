-- Medosha 360° — what an owner and a stranger are allowed to do with a tour.
--
-- Run this in the Supabase SQL editor after applying 0057 and 0058. It prints
-- one line per check and rolls itself back at the end.
--
-- It matters that it runs as `authenticated`, not as the editor's default
-- role. A superuser bypasses row-level security entirely, so a probe run as
-- one reports that every rule works and proves nothing. The `set role` lines
-- below are the whole point of the file.
--
-- One finding is worth reading before changing the server action: the scenes
-- and their hotspots MUST be written in two statements. A data-modifying CTE
-- that inserts both at once is rejected, because the hotspot policy's
-- `with check` resolves through tour_scenes and cannot see rows the same
-- statement is inserting. src/app/tours/actions.ts writes the scenes, reads
-- their ids back, and then writes the hotspots — that shape is required, not
-- incidental.

begin;

-- Two real users, so the policies have something to distinguish.
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'owner@example.com'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'other@example.com')
on conflict (id) do nothing;

-- ===================================================================
-- 1. An owner saves a tour: the exact sequence the server action runs.
-- ===================================================================
set role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';

insert into public.tours (id, owner_id, title, visibility)
values ('bbbbbbbb-0000-0000-0000-000000000001',
        'aaaaaaaa-0000-0000-0000-000000000001', 'Bole two bedroom', 'draft');

-- Two statements, not one. A data-modifying CTE that inserts the scenes and
-- their hotspots together fails: the hotspot policy's `with check` cannot see
-- rows the same statement is inserting, so every hotspot is rejected. The
-- server action inserts scenes, reads their ids back, then inserts hotspots —
-- which is what this reproduces.
insert into public.tour_scenes (id, tour_id, title, panorama_url, position)
values
  ('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001',
   'Living room', 'https://x/1.jpg', 0),
  ('cccccccc-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001',
   'Kitchen', 'https://x/2.jpg', 1);

insert into public.tour_hotspots (scene_id, kind, yaw, pitch, title, target_scene_id)
values ('cccccccc-0000-0000-0000-000000000001', 'scene', 90, 0, 'To the kitchen',
        'cccccccc-0000-0000-0000-000000000002');

select '1. owner saved a tour with a door' as step,
       (select count(*) from public.tour_scenes
        where tour_id = 'bbbbbbbb-0000-0000-0000-000000000001') as scenes,
       (select count(*) from public.tour_hotspots h
        join public.tour_scenes sc on sc.id = h.scene_id
        where sc.tour_id = 'bbbbbbbb-0000-0000-0000-000000000001') as hotspots;

-- ===================================================================
-- 2. A draft is invisible to everybody else.
-- ===================================================================
reset role;
set role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000002","role":"authenticated"}';

select '2. a stranger sees the draft' as step,
       (select count(*) from public.tours
        where id = 'bbbbbbbb-0000-0000-0000-000000000001') as tours,
       (select count(*) from public.tour_scenes
        where tour_id = 'bbbbbbbb-0000-0000-0000-000000000001') as scenes,
       (select count(*) from public.tour_hotspots) as hotspots;

-- A stranger must not be able to add a scene to somebody else's tour.
do $$
begin
  insert into public.tour_scenes (tour_id, title, panorama_url, position)
  values ('bbbbbbbb-0000-0000-0000-000000000001', 'Injected', 'https://evil/1.jpg', 9);
  raise notice '2b. STRANGER WROTE A SCENE — POLICY FAILED';
exception when insufficient_privilege or check_violation then
  raise notice '2b. a stranger cannot add a scene (blocked)';
end $$;

-- ===================================================================
-- 3. Publishing makes it readable, to a stranger and to anon alike.
-- ===================================================================
reset role;
set role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';
update public.tours set visibility = 'published', published_at = now()
where id = 'bbbbbbbb-0000-0000-0000-000000000001';

reset role;
set role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000002","role":"authenticated"}';
select '3. a stranger sees the published tour' as step,
       (select count(*) from public.tours
        where id = 'bbbbbbbb-0000-0000-0000-000000000001') as tours,
       (select count(*) from public.tour_scenes
        where tour_id = 'bbbbbbbb-0000-0000-0000-000000000001') as scenes,
       (select count(*) from public.tour_hotspots) as hotspots;

reset role;
set role anon;
set local request.jwt.claims = '{"role":"anon"}';
select '3b. a signed-out visitor sees it' as step,
       (select count(*) from public.tours
        where id = 'bbbbbbbb-0000-0000-0000-000000000001') as tours,
       (select count(*) from public.tour_scenes
        where tour_id = 'bbbbbbbb-0000-0000-0000-000000000001') as scenes;

-- ===================================================================
-- 4. A stranger still cannot change or delete it.
-- ===================================================================
reset role;
set role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000002","role":"authenticated"}';

update public.tours set title = 'Stolen'
where id = 'bbbbbbbb-0000-0000-0000-000000000001';
delete from public.tour_scenes where tour_id = 'bbbbbbbb-0000-0000-0000-000000000001';
delete from public.tours where id = 'bbbbbbbb-0000-0000-0000-000000000001';

reset role;
select '4. after a stranger tried to edit and delete' as step,
       (select title from public.tours
        where id = 'bbbbbbbb-0000-0000-0000-000000000001') as title,
       (select count(*) from public.tour_scenes
        where tour_id = 'bbbbbbbb-0000-0000-0000-000000000001') as scenes_left;

-- ===================================================================
-- 5. The replace-wholesale update: scenes cascade to their hotspots.
-- ===================================================================
set role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';
delete from public.tour_scenes where tour_id = 'bbbbbbbb-0000-0000-0000-000000000001';

reset role;
select '5. deleting the scenes took the hotspots' as step,
       (select count(*) from public.tour_scenes
        where tour_id = 'bbbbbbbb-0000-0000-0000-000000000001') as scenes,
       (select count(*) from public.tour_hotspots) as orphaned_hotspots;

-- ===================================================================
-- 6. properties.has_360 has one answer, not two.
--
-- 0017 wrote this column from property_media and 0057 wrote it from tours.
-- Neither knew about the other, so adding an ordinary photo to a listing with
-- a published tour turned its 360° badge off — silently, on the map, with no
-- error anywhere. 0059 gave both triggers the same question to ask.
-- ===================================================================
reset role;
insert into auth.users (id, email) values
  ('dddddddd-0000-0000-0000-000000000001', 'flag-owner@example.test'),
  ('dddddddd-0000-0000-0000-000000000002', 'flag-stranger@example.test')
on conflict (id) do nothing;

insert into public.properties
  (id, owner_id, title, slug, property_type, listing_kind, latitude, longitude)
values ('eeeeeeee-0000-0000-0000-000000000001',
        'dddddddd-0000-0000-0000-000000000001',
        'Flag probe', 'flag-probe', 'apartment', 'sale', 9.0, 38.75);

insert into public.tours (id, owner_id, title, property_id, visibility, published_at)
values ('ffffffff-0000-0000-0000-000000000001',
        'dddddddd-0000-0000-0000-000000000001',
        'Probe tour', 'eeeeeeee-0000-0000-0000-000000000001', 'published', now());

-- A cleared room. Since 0060 a tour whose every scene is still in review has
-- nothing to show a visitor and must not light the badge, so a tour with no
-- scenes at all does not either.
insert into public.tour_scenes (tour_id, title, panorama_url, position)
values ('ffffffff-0000-0000-0000-000000000001', 'Living room',
        'https://example.test/probe.jpg', 0);

insert into public.property_media (property_id, kind, url)
values ('eeeeeeee-0000-0000-0000-000000000001', 'photo', 'https://example.test/a.jpg');

select '6. an unrelated photo did not wipe the flag' as step,
       has_360 as should_be_true
from public.properties where id = 'eeeeeeee-0000-0000-0000-000000000001';

-- The other direction: a legacy panorama survives the tour being withdrawn.
insert into public.property_media (property_id, kind, url)
values ('eeeeeeee-0000-0000-0000-000000000001', 'panorama_360', 'https://example.test/p.jpg');
update public.tours set visibility = 'draft'
where id = 'ffffffff-0000-0000-0000-000000000001';

select '6b. withdrawing the tour left the panorama media' as step,
       has_360 as should_be_true
from public.properties where id = 'eeeeeeee-0000-0000-0000-000000000001';

delete from public.property_media
where property_id = 'eeeeeeee-0000-0000-0000-000000000001' and kind = 'panorama_360';

select '6c. with neither source, the flag is off' as step,
       has_360 as should_be_false
from public.properties where id = 'eeeeeeee-0000-0000-0000-000000000001';

-- tours.property_id carries no ownership check, so anyone may aim a tour at
-- any listing. Only the owner's own tour may light the badge.
-- Given a cleared room of its own, so this fails on ownership alone rather
-- than on having nothing to show.
with hijack as (
  insert into public.tours (owner_id, title, property_id, visibility, published_at)
  values ('dddddddd-0000-0000-0000-000000000002', 'Hijack',
          'eeeeeeee-0000-0000-0000-000000000001', 'published', now())
  returning id
)
insert into public.tour_scenes (tour_id, title, panorama_url, position)
select id, 'Room', 'https://example.test/hijack.jpg', 0 from hijack;

select '6d. a stranger cannot light the badge' as step,
       has_360 as should_be_false
from public.properties where id = 'eeeeeeee-0000-0000-0000-000000000001';

-- A published tour whose only room is still in review has nothing to show.
-- Sending somebody to an empty tour is worse than not offering one.
update public.tour_scenes
set panorama_url = null, quarantine_path = 'dddddddd-0000-0000-0000-000000000001/x.jpg'
where tour_id = 'ffffffff-0000-0000-0000-000000000001';

update public.tours set visibility = 'published', published_at = now()
where id = 'ffffffff-0000-0000-0000-000000000001';

select '6e. a tour with every room in review does not light it' as step,
       has_360 as should_be_false
from public.properties where id = 'eeeeeeee-0000-0000-0000-000000000001';

update public.tour_scenes
set panorama_url = 'https://example.test/probe.jpg', quarantine_path = null
where tour_id = 'ffffffff-0000-0000-0000-000000000001';

select '6f. clearing that room lights it' as step,
       has_360 as should_be_true
from public.properties where id = 'eeeeeeee-0000-0000-0000-000000000001';

-- ===================================================================
-- 7. A room waiting on review.
--
-- It belongs to the tour from the moment it is uploaded — the person carries
-- on building — but the file is still in quarantine, which is private. The
-- owner sees the room; nobody else does; approving it is what makes it appear.
-- ===================================================================
reset role;
insert into public.tours (id, owner_id, title, visibility, published_at)
values ('99999999-1111-0000-0000-000000000001',
        'aaaaaaaa-0000-0000-0000-000000000001',
        'Half reviewed', 'published', now());

insert into public.tour_scenes (tour_id, title, panorama_url, position)
values ('99999999-1111-0000-0000-000000000001', 'Living room',
        'https://example.test/live.jpg', 0);

insert into public.tour_scenes (id, tour_id, title, quarantine_path, position)
values ('99999999-2222-0000-0000-000000000001',
        '99999999-1111-0000-0000-000000000001', 'Kitchen',
        'aaaaaaaa-0000-0000-0000-000000000001/k.jpg', 1);

set role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select '7. the owner sees both rooms' as step, count(*) as should_be_2
from public.tour_scenes where tour_id = '99999999-1111-0000-0000-000000000001';

reset role; set role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
select '7b. a visitor sees only the cleared room' as step, count(*) as should_be_1
from public.tour_scenes where tour_id = '99999999-1111-0000-0000-000000000001';

reset role; set role anon;
select '7c. signed out, only the cleared room' as step, count(*) as should_be_1
from public.tour_scenes where tour_id = '99999999-1111-0000-0000-000000000001';

-- Approval fills in the URL, which is what makes the room public.
reset role;
update public.tour_scenes
set panorama_url = 'https://example.test/kitchen.jpg', quarantine_path = null
where id = '99999999-2222-0000-0000-000000000001';

set role anon;
select '7d. once approved, the visitor sees both' as step, count(*) as should_be_2
from public.tour_scenes where tour_id = '99999999-1111-0000-0000-000000000001';

reset role;
do $$ begin
  insert into public.tour_scenes (tour_id, title, position)
  values ('99999999-1111-0000-0000-000000000001', 'Neither', 2);
  raise notice '7e. A SCENE WITH NO IMAGE WAS ACCEPTED — constraint failed';
exception when check_violation then
  raise notice '7e. a scene with neither a URL nor a path is refused';
end $$;

rollback;
