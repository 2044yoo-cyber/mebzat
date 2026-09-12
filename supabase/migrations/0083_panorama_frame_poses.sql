-- Where the phone was pointing for each photograph.
--
-- The old capture was one horizontal ring, so a frame needed one number — its
-- yaw — and that fitted in the filename. A sphere needs a yaw, a pitch, a roll
-- and the field of view the camera was using, and those do not fit in a
-- filename without being rounded to whole degrees. A degree of rounding on
-- every frame is a degree the stitcher then has to find again by correlation,
-- which is work it does not always win.
--
-- So the pose is recorded next to the job. The stitcher reads it as its
-- starting estimate and refines from there, which is the difference between a
-- search that starts three degrees out and one that starts thirty.

alter table public.panorama_jobs
  add column if not exists frames jsonb;

comment on column public.panorama_jobs.frames is
  'One entry per uploaded frame: {name, targetId, yaw, pitch, roll, fov, width, height, at}. The phone''s own reading, used as the initial pose estimate for stitching.';

-- An array, and a bounded one. Without the shape check this column is a place
-- a client can put an arbitrary document of arbitrary size, which is a storage
-- bill rather than a capture.
alter table public.panorama_jobs
  drop constraint if exists panorama_jobs_frames_shape;
alter table public.panorama_jobs
  add constraint panorama_jobs_frames_shape check (
    frames is null
    or (
      jsonb_typeof(frames) = 'array'
      and jsonb_array_length(frames) <= 60
      and pg_column_size(frames) <= 16384
    )
  );

-- A sphere is around forty frames, not nine. 0081 capped both counts at 40 for
-- a single ring; the ceiling moves with the plan.
alter table public.panorama_jobs
  drop constraint if exists panorama_jobs_frames_sane;
alter table public.panorama_jobs
  add constraint panorama_jobs_frames_sane check (
    expected_frames between 0 and 60
    and uploaded_frames between 0 and 60
  );
