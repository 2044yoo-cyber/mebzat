-- Floor plans, beside the 360° tour rather than on the map.
--
-- A buyer looking at a room in 360° wants to know where in the flat they are
-- standing, and somebody reading a plan wants to see what the rooms look like.
-- The two belong next to each other, in the property's own visualisation — not
-- on the city map, which is for finding a building, not for reading one.
--
-- What already existed: property_media carries a `floor_plan` kind. It is not
-- enough here for the same reason it was not enough for panoramas —
-- property_media.property_id is NOT NULL, so a plan of a *building's* fourth
-- floor, or of a project, has nowhere to live, and there is no link to a tour.
-- A plan that is also a property's media can be both; nothing here removes
-- that.

alter type public.content_kind add value if not exists 'floor_plan';

-- A plan is very often a PDF, and quarantine only took images and video.
update storage.buckets
set allowed_mime_types = (
  select array_agg(distinct m)
  from unnest(allowed_mime_types || array['application/pdf']) as m
)
where id = 'moderation-quarantine'
  and not (allowed_mime_types @> array['application/pdf']);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'floor-plans',
  'floor-plans',
  true,
  26214400,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

drop policy if exists "Floor plans are readable" on storage.objects;
create policy "Floor plans are readable"
  on storage.objects for select
  to authenticated, anon
  using (bucket_id = 'floor-plans');

drop policy if exists "Owners write their floor plans" on storage.objects;
create policy "Owners write their floor plans"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'floor-plans'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ----------------------------------------------------------------- the table

create table if not exists public.floor_plans (
  id uuid primary key default gen_random_uuid(),

  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null,

  -- Same two-state file as a scene: a published URL once it has been cleared,
  -- a quarantine path while it is waiting. Never both meaningful at once.
  file_url text,
  quarantine_path text,
  moderation_item_id uuid references public.moderation_items (id) on delete set null,

  -- An image is drawn on a canvas that pans and zooms; a PDF is handed to the
  -- browser's own viewer, which already does pages properly.
  media_type text not null default 'image'
    check (media_type in ('image', 'pdf')),
  width integer,
  height integer,

  -- What it is a plan *of*. All independent and all optional: a plan may
  -- belong to a flat, to the building around it, to one floor of that
  -- building, or to a project. A unit is a property, so property_id covers
  -- "Apartment 402" without a table of its own.
  property_id uuid references public.properties (id) on delete cascade,
  building_id uuid references public.buildings (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  floor_number smallint,

  -- The tour it sits beside, when there is one. Deleting the tour leaves the
  -- plan: it is a document about the property, not part of the tour.
  tour_id uuid references public.tours (id) on delete set null,

  position smallint not null default 0,
  created_at timestamptz not null default now(),

  constraint floor_plans_has_a_file check (
    file_url is not null or quarantine_path is not null
  )
);

create index if not exists floor_plans_property_idx
  on public.floor_plans (property_id) where property_id is not null;
create index if not exists floor_plans_building_idx
  on public.floor_plans (building_id) where building_id is not null;
create index if not exists floor_plans_project_idx
  on public.floor_plans (project_id) where project_id is not null;
create index if not exists floor_plans_tour_idx
  on public.floor_plans (tour_id) where tour_id is not null;
create index if not exists floor_plans_pending_idx
  on public.floor_plans (moderation_item_id) where moderation_item_id is not null;

-- --------------------------------------------------------------- row security

alter table public.floor_plans enable row level security;

/** A cleared plan is public, like a listing's photographs. One still in
 * quarantine is the owner's alone, and is previewed through a signed URL — the
 * same rule the tour scenes use, for the same reason. */
drop policy if exists "Cleared floor plans are readable" on public.floor_plans;
create policy "Cleared floor plans are readable"
  on public.floor_plans for select
  to authenticated, anon
  using (file_url is not null or owner_id = auth.uid());

-- Row security decides who sees what; the grant decides whether the role may
-- ask at all. Without it every query is "permission denied for table
-- floor_plans" no matter how the policies read — 0057 grants the same way.
grant select on public.floor_plans to anon, authenticated;
grant insert, update, delete on public.floor_plans to authenticated;

drop policy if exists "Owners manage their floor plans" on public.floor_plans;
create policy "Owners manage their floor plans"
  on public.floor_plans for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
