-- 360° tours: a named, ordered, shareable collection of panoramas.
--
-- What already existed: property_media models spatial content properly. Its
-- kind enum carries panorama_360, virtual_tour and ar_model, and it has
-- heading and pitch — the initial yaw and pitch a panorama opens at — plus
-- room, floor_label, position, thumbnail_url and the dimension fields. A scene
-- was already describable.
--
-- What did not exist: any grouping. property_media hangs off one property and
-- has no title, no order across a set, no visibility, and no hotspots.
--
-- Why scenes carry their own panorama rather than pointing only at
-- property_media: property_media.property_id is NOT NULL, and its RLS policy
-- resolves visibility *through* that property. A project panorama, a building
-- lobby or a standalone community post has no property, so reusing that table
-- would mean relaxing a NOT NULL and rewriting a working policy on a table
-- holding live data. media_id is kept as a nullable link, so a panorama that
-- is also a property's media is joined rather than copied.

do $$ begin
  create type public.tour_visibility as enum (
    'draft', 'published', 'unlisted', 'private', 'archived'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.hotspot_kind as enum (
    'scene', 'info', 'image', 'video', 'property', 'project', 'link'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------- tours

create table if not exists public.tours (
  id uuid primary key default gen_random_uuid(),

  owner_id uuid not null references auth.users (id) on delete cascade,
  -- An agency's tour outlives the employee who uploaded it.
  company_id uuid references public.companies (id) on delete set null,

  title text not null,
  description text,

  visibility public.tour_visibility not null default 'draft',
  thumbnail_url text,

  -- What it is a tour *of*. All nullable and independent: a tour may belong to
  -- a unit, to the building around it, to a project, or to nothing at all
  -- because somebody posted a kitchen to the feed.
  property_id uuid references public.properties (id) on delete set null,
  building_id uuid references public.buildings (id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,

  view_count integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,

  constraint tours_published_has_time check (
    (visibility <> 'published') or published_at is not null
  )
);

create index if not exists tours_owner_idx on public.tours (owner_id);
create index if not exists tours_property_idx on public.tours (property_id) where property_id is not null;
create index if not exists tours_building_idx on public.tours (building_id) where building_id is not null;
create index if not exists tours_project_idx on public.tours (project_id) where project_id is not null;
create index if not exists tours_public_idx on public.tours (published_at desc) where visibility = 'published';

-- --------------------------------------------------------------------- scenes

create table if not exists public.tour_scenes (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references public.tours (id) on delete cascade,

  title text not null,
  panorama_url text not null,
  thumbnail_url text,
  blur_data_url text,
  width integer,
  height integer,

  -- Where the scene opens. Degrees, matching property_media.heading/pitch.
  initial_yaw real not null default 0,
  initial_pitch real not null default 0,
  initial_zoom real not null default 75 check (initial_zoom between 20 and 120),

  position smallint not null default 0,

  -- The same panorama as a property's media row, when it is one. A join
  -- rather than a copy.
  media_id uuid references public.property_media (id) on delete set null,

  created_at timestamptz not null default now()
);

create index if not exists tour_scenes_tour_idx on public.tour_scenes (tour_id, position);

-- ------------------------------------------------------------------ hotspots

create table if not exists public.tour_hotspots (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null references public.tour_scenes (id) on delete cascade,

  kind public.hotspot_kind not null default 'info',

  -- Where it sits on the sphere.
  yaw real not null,
  pitch real not null,

  title text not null,
  description text,

  -- A hotspot points at exactly one thing, and which one is decided by kind.
  -- Deleting the scene a hotspot points at nulls the target rather than
  -- removing the hotspot, so the tour keeps working with a dead link instead
  -- of losing the marker silently.
  target_scene_id uuid references public.tour_scenes (id) on delete set null,
  target_property_id uuid references public.properties (id) on delete set null,
  target_project_id uuid references public.projects (id) on delete set null,
  target_url text,
  image_url text,
  video_url text,

  created_at timestamptz not null default now(),

  -- A scene hotspot that points nowhere is a dead end the builder should not
  -- have been able to save.
  constraint hotspot_scene_has_target check (
    kind <> 'scene' or target_scene_id is not null
  )
);

create index if not exists tour_hotspots_scene_idx on public.tour_hotspots (scene_id);

-- --------------------------------------------------------------- row security

alter table public.tours enable row level security;
alter table public.tour_scenes enable row level security;
alter table public.tour_hotspots enable row level security;

/** Whether the reader may see this tour at all.
 *
 * Unlisted counts as visible: it is reachable by anyone holding the link, and
 * the link is the only way to arrive at it. Private and draft are the owner's
 * alone; archived is nobody's. */
create or replace function public.tour_is_readable(t public.tours)
returns boolean
language sql
stable
as $$
  select t.visibility in ('published', 'unlisted') or t.owner_id = auth.uid();
$$;

drop policy if exists "Readable tours are readable" on public.tours;
create policy "Readable tours are readable"
  on public.tours for select
  to authenticated, anon
  using (public.tour_is_readable(tours));

drop policy if exists "Owners manage their tours" on public.tours;
create policy "Owners manage their tours"
  on public.tours for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Scenes and hotspots inherit their tour's visibility rather than carrying
-- their own copy of the rule: two places to change it is one place to forget.
drop policy if exists "Scenes follow their tour" on public.tour_scenes;
create policy "Scenes follow their tour"
  on public.tour_scenes for select
  to authenticated, anon
  using (exists (
    select 1 from public.tours t
    where t.id = tour_scenes.tour_id and public.tour_is_readable(t)
  ));

drop policy if exists "Owners manage their scenes" on public.tour_scenes;
create policy "Owners manage their scenes"
  on public.tour_scenes for all
  to authenticated
  using (exists (
    select 1 from public.tours t
    where t.id = tour_scenes.tour_id and t.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.tours t
    where t.id = tour_scenes.tour_id and t.owner_id = auth.uid()
  ));

drop policy if exists "Hotspots follow their scene" on public.tour_hotspots;
create policy "Hotspots follow their scene"
  on public.tour_hotspots for select
  to authenticated, anon
  using (exists (
    select 1 from public.tour_scenes s
    join public.tours t on t.id = s.tour_id
    where s.id = tour_hotspots.scene_id and public.tour_is_readable(t)
  ));

drop policy if exists "Owners manage their hotspots" on public.tour_hotspots;
create policy "Owners manage their hotspots"
  on public.tour_hotspots for all
  to authenticated
  using (exists (
    select 1 from public.tour_scenes s
    join public.tours t on t.id = s.tour_id
    where s.id = tour_hotspots.scene_id and t.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.tour_scenes s
    join public.tours t on t.id = s.tour_id
    where s.id = tour_hotspots.scene_id and t.owner_id = auth.uid()
  ));

grant select on public.tours, public.tour_scenes, public.tour_hotspots to anon, authenticated;
grant insert, update, delete on public.tours, public.tour_scenes, public.tour_hotspots to authenticated;

-- ------------------------------------------------------------------- storage

-- Private. A panorama reaches the public web only after moderation copies it
-- out, which is the same path every other upload now takes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'panoramas',
  'panoramas',
  true,
  26214400,
  array['image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

drop policy if exists "Panoramas are readable" on storage.objects;
create policy "Panoramas are readable"
  on storage.objects for select
  to authenticated, anon
  using (bucket_id = 'panoramas');

drop policy if exists "Owners write their panoramas" on storage.objects;
create policy "Owners write their panoramas"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'panoramas'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- --------------------------------------------------------- 360 on a property

/** Kept true by the tours attached to it, rather than set by hand. The badge
 * on a property card was already reading this column; nothing was maintaining
 * it. */
create or replace function public.sync_property_has_360()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target uuid;
begin
  target := coalesce(new.property_id, old.property_id);
  if target is null then return coalesce(new, old); end if;

  update public.properties p
  set has_360 = exists (
    select 1 from public.tours t
    where t.property_id = target and t.visibility = 'published'
  )
  where p.id = target;

  return coalesce(new, old);
end;
$$;

drop trigger if exists tours_sync_has_360 on public.tours;
create trigger tours_sync_has_360
  after insert or update of visibility, property_id or delete on public.tours
  for each row execute function public.sync_property_has_360();
