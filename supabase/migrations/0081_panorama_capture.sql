-- Turning around on the spot with a phone, and getting one 360° image out.
--
-- Everything after the panorama already existed: 0057 gave tours, scenes and
-- hotspots, 0058 put panoramas through the same moderation path as every other
-- upload, and the viewer, the 2:1 validation and the property `panorama_360`
-- media kind were all built. What was missing was the front of it — a way to
-- *make* a panorama with the phone in your hand rather than with a £300
-- camera.
--
-- This is the bookkeeping for that: the frames somebody captured, what stage
-- their stitch is at, and enough of a reason when it fails to tell them
-- something they can act on.

do $$ begin
  create type public.panorama_job_status as enum (
    -- Frames are being taken. Nothing uploaded yet.
    'capturing',
    -- Frames are going up. The phone may be on a slow connection.
    'uploading',
    -- Frames are all up; the server is stitching.
    'processing',
    -- One panorama exists at `panorama_url`.
    'ready',
    -- It did not work. `error_code` says which of section 17's cases it was.
    'failed'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.panorama_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,

  status public.panorama_job_status not null default 'capturing',

  -- How many frames the capture screen said it would send, and how many
  -- actually landed. A stitch that starts before the last one arrives is a
  -- panorama with a hole in it.
  expected_frames smallint not null default 0,
  uploaded_frames smallint not null default 0,

  -- The folder in the private `panorama-frames` bucket. Every frame for this
  -- job lives under it, which is what makes cleaning up one line.
  frames_prefix text,

  -- Set once. The published equirectangular image.
  panorama_url text,
  width integer,
  height integer,

  -- Machine-readable, so the client can pick the sentence. Never shown raw.
  error_code text,

  -- What it is a panorama *of*. All nullable and independent, the same shape
  -- 0057 chose for tours: a capture may belong to a unit, to a project, or to
  -- nothing at all while somebody is still deciding.
  property_id uuid references public.properties (id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,

  -- When the temporary frames may be deleted. Section 16: keep them while a
  -- retry is still plausible, and not a day longer.
  frames_expire_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint panorama_jobs_ready_has_image check (
    status <> 'ready' or panorama_url is not null
  ),
  constraint panorama_jobs_failed_has_reason check (
    status <> 'failed' or error_code is not null
  ),
  constraint panorama_jobs_frames_sane check (
    expected_frames between 0 and 40
    and uploaded_frames between 0 and 40
  )
);

comment on table public.panorama_jobs is
  'One attempt at capturing and stitching a 360 panorama. The frames are temporary; the panorama is not.';

create index if not exists panorama_jobs_owner_idx
  on public.panorama_jobs (owner_id, created_at desc);
-- The sweeper looks for expired frames, so it should not read the whole table.
create index if not exists panorama_jobs_expiry_idx
  on public.panorama_jobs (frames_expire_at)
  where frames_expire_at is not null;

create trigger panorama_jobs_set_updated_at
  before update on public.panorama_jobs
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.panorama_jobs enable row level security;

-- A capture in progress is nobody's business but its owner's. It is a
-- half-finished photograph of the inside of somebody's house.
drop policy if exists "Owners read their own panorama jobs" on public.panorama_jobs;
create policy "Owners read their own panorama jobs"
  on public.panorama_jobs for select
  to authenticated
  using (auth.uid() = owner_id);

drop policy if exists "Owners create their own panorama jobs" on public.panorama_jobs;
create policy "Owners create their own panorama jobs"
  on public.panorama_jobs for insert
  to authenticated
  with check (auth.uid() = owner_id);

drop policy if exists "Owners update their own panorama jobs" on public.panorama_jobs;
create policy "Owners update their own panorama jobs"
  on public.panorama_jobs for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "Owners delete their own panorama jobs" on public.panorama_jobs;
create policy "Owners delete their own panorama jobs"
  on public.panorama_jobs for delete
  to authenticated
  using (auth.uid() = owner_id);

-- The client reports progress and the server reports the result. Letting a
-- browser write `ready` and a `panorama_url` would let it publish any URL it
-- liked as a finished panorama, which is the moderation path bypassed
-- entirely — the file has to have gone through the server to exist.
create or replace function public.guard_panorama_job_result()
returns trigger
language plpgsql
-- `security invoker`, for the reason 0064, 0068 and 0080 all give: as a
-- definer this runs as its owner, `current_user` could never be an API role,
-- and the guard would read as protection while permitting everything.
security invoker
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.panorama_url is distinct from old.panorama_url then
      raise exception 'panorama_url is set by the server, not by the client'
        using errcode = 'insufficient_privilege';
    end if;
    if new.status = 'ready' and old.status <> 'ready' then
      raise exception 'a panorama is marked ready by the server, not by the client'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists panorama_jobs_guard_result on public.panorama_jobs;
create trigger panorama_jobs_guard_result
  before update on public.panorama_jobs
  for each row
  execute function public.guard_panorama_job_result();

-- ---------------------------------------------------------------------------
-- The frames
-- ---------------------------------------------------------------------------

-- Private, and folder-scoped to the uploader in the same shape as quarantine.
-- These are raw frames of somebody's living room; nothing here should be
-- fetchable by anybody who learns a path.
--
-- 8 MB a frame is generous: the capture screen downscales to about 2000px
-- before upload, which lands well under it. The ceiling is there to stop a
-- crafted client using this as free storage.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'panorama-frames',
  'panorama-frames',
  false,
  8388608,
  array['image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

drop policy if exists "members upload their own panorama frames" on storage.objects;
create policy "members upload their own panorama frames"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'panorama-frames'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "members read their own panorama frames" on storage.objects;
create policy "members read their own panorama frames"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'panorama-frames'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "members delete their own panorama frames" on storage.objects;
create policy "members delete their own panorama frames"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'panorama-frames'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- Cleaning up
-- ---------------------------------------------------------------------------

-- Section 16: the frames are temporary, and a stitch that worked has no use
-- for them at all. A stitch that failed keeps them for a day so the person can
-- retry without turning around the room again.
--
-- Returns the prefixes whose frames are due, rather than deleting the objects
-- itself: storage is not a table this can reach, so the caller does the
-- removal and calls `forget_panorama_frames` when it is done.
create or replace function public.expired_panorama_frames(p_limit integer default 100)
returns table (id uuid, frames_prefix text)
language sql
stable
security definer
set search_path = public
as $$
  select j.id, j.frames_prefix
  from public.panorama_jobs j
  where j.frames_prefix is not null
    and j.frames_expire_at is not null
    and j.frames_expire_at < now()
  order by j.frames_expire_at
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
$$;

create or replace function public.forget_panorama_frames(p_job uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.panorama_jobs
  set frames_prefix = null, frames_expire_at = null
  where id = p_job;
$$;

revoke execute on function public.expired_panorama_frames(integer) from public, anon, authenticated;
revoke execute on function public.forget_panorama_frames(uuid) from public, anon, authenticated;
