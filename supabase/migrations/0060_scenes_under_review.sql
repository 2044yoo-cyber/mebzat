-- A panorama waiting on review still belongs to its tour.
--
-- Until now a scene whose upload came back `review` was dropped on the floor:
-- the file sat in quarantine, the builder was handed nothing, and the person
-- who had just waited for a 20MB upload saw an empty room list and a toast.
-- There was no way to tell that from a failure, and nothing to do about it.
--
-- The model this moves to is the one people already know from posting a video:
-- you finish the thing you were doing, it is yours to see and edit, and the
-- public does not get it until it has been looked at.
--
-- What that needs, and what this migration adds:
--
--   * a scene may hold a quarantine path instead of a public URL, so the row
--     can exist before the file is published;
--   * the owner can see such a scene and nobody else can, so an unreviewed
--     panorama is never served to a visitor;
--   * the 360° badge only lights for a tour with at least one *published*
--     scene, so a badge never leads to a tour with nothing in it.
--
-- The file itself does not move. It stays in `moderation-quarantine`, which is
-- private and folder-scoped to the uploader; the owner previews it through a
-- signed URL. Nothing unreviewed becomes fetchable by anyone.

alter table public.tour_scenes
  add column if not exists quarantine_path text,
  add column if not exists moderation_item_id uuid
    references public.moderation_items (id) on delete set null;

-- A scene now starts life without a public URL.
alter table public.tour_scenes alter column panorama_url drop not null;

do $$ begin
  alter table public.tour_scenes
    add constraint tour_scenes_has_an_image
    check (panorama_url is not null or quarantine_path is not null);
exception when duplicate_object then null; end $$;

create index if not exists tour_scenes_pending_idx
  on public.tour_scenes (moderation_item_id)
  where moderation_item_id is not null;

-- ------------------------------------------------------------- who sees what

/** A scene still in quarantine is the owner's alone.
 *
 * The tour may be published — that is the point, the person carries on — but
 * the rooms inside it appear one by one as they are cleared. A visitor sees
 * the tour without them; the owner sees all of them, marked. */
drop policy if exists "Scenes follow their tour" on public.tour_scenes;
create policy "Scenes follow their tour"
  on public.tour_scenes for select
  to authenticated, anon
  using (exists (
    select 1 from public.tours t
    where t.id = tour_scenes.tour_id
      and public.tour_is_readable(t)
      and (tour_scenes.panorama_url is not null or t.owner_id = auth.uid())
  ));

-- ------------------------------------------------------------------ the badge

/** As 0059, with one addition: a tour every scene of which is still in review
 * has nothing to show a visitor, so it must not light the badge. Sending
 * somebody to an empty tour is worse than not offering one. */
create or replace function public.property_has_360(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.property_media m
    where m.property_id = target and m.kind = 'panorama_360'
  ) or exists (
    select 1
    from public.tours t
    join public.properties p on p.id = t.property_id
    where t.property_id = target
      and t.visibility = 'published'
      and t.owner_id = p.owner_id
      and exists (
        select 1 from public.tour_scenes s
        where s.tour_id = t.id and s.panorama_url is not null
      )
  );
$$;

-- ------------------------------------------------- keeping the badge honest
--
-- The rule above now depends on tour_scenes, and nothing was watching that
-- table. 0057's trigger fires on `tours`, so publishing a tour recomputed the
-- flag but *approving a panorama* did not: the room would appear inside the
-- tour while the property went on showing no 360° badge at all. Caught by the
-- test in supabase/tests/tours.sql, which asked for the flag after clearing a
-- room and got false.

create or replace function public.sync_scene_property_has_360()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  select t.property_id into target
  from public.tours t
  where t.id = coalesce(new.tour_id, old.tour_id);

  if target is null then return coalesce(new, old); end if;

  update public.properties p
  set has_360 = public.property_has_360(target)
  where p.id = target;

  return coalesce(new, old);
end;
$$;

drop trigger if exists tour_scene_sync_has_360 on public.tour_scenes;
create trigger tour_scene_sync_has_360
  after insert or update or delete on public.tour_scenes
  for each row
  execute function public.sync_scene_property_has_360();

update public.properties p
set has_360 = public.property_has_360(p.id)
where p.has_360 is distinct from public.property_has_360(p.id);
