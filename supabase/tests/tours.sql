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

rollback;
