-- A panorama on the wall has no file of its own.
--
-- 0090 gave `agenda_photos` both a `storage_path` and a `panorama_job_id`, and
-- made the path `not null`. Those two cannot both be true: a progress
-- panorama is a `panorama_jobs` row that 0081 to 0083 already captured,
-- stitched and published, and its image lives in the `panoramas` bucket under
-- that pipeline's own name. There is nothing to put in `agenda-files` for it,
-- so every attempt to pin one to a place on site fails on a not-null column.
--
-- The fix is not to invent a path. It is to say what the row actually
-- requires: a photograph is either a file filed here, or a panorama produced
-- over there, and it must be one of the two. A row that is neither is a
-- caption with no picture, which is what the constraint refuses.
--
-- ## Why the panorama is pointed at rather than copied
--
-- Copying the equirectangular image into `agenda-files` would double the
-- storage for every progress panorama and, worse, fork it: a re-stitch that
-- fixed a seam would fix the tour and not the site record. One image, two
-- things pointing at it.

begin;

alter table public.agenda_photos
  alter column storage_path drop not null;

comment on column public.agenda_photos.storage_path is
  'Path inside the agenda-files bucket. Null for a progress panorama, whose image belongs to the panorama_jobs row it points at.';

-- Named rather than anonymous, so a later migration can find it.
alter table public.agenda_photos
  drop constraint if exists agenda_photos_has_an_image;
alter table public.agenda_photos
  add constraint agenda_photos_has_an_image
  check (storage_path is not null or panorama_job_id is not null);

create index if not exists agenda_photos_panorama_idx
  on public.agenda_photos (project_id, taken_at desc)
  where panorama_job_id is not null;

commit;
