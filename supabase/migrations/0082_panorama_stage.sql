-- Which part of the stitch is happening now.
--
-- Section 10 asks for step-based progress — Uploading, Aligning photos,
-- Stitching panorama, Optimizing, Ready — and says in the same breath not to
-- claim percentages the backend cannot provide. The client can see the upload
-- because it is doing it. It can see nothing at all of the three steps in the
-- middle, which happen inside one request on the server.
--
-- So the server writes down where it has got to, and the screen reads it. The
-- alternative was a client-side animation through the step names, which would
-- have looked identical on a good day and lied on a bad one: a stitch stuck on
-- a slow download would have shown "Optimizing" and then failed.
--
-- `status` is not the place for this. It is what the *job* is — five states
-- that the constraints and the result guard are written in terms of — and
-- adding three more to it would mean revisiting every one of those. A stage is
-- a detail of `processing`, and it is null in every other status.

alter table public.panorama_jobs
  add column if not exists stage text;

comment on column public.panorama_jobs.stage is
  'Where inside `processing` the server has got to. Null unless status = ''processing''. Advisory: for the progress screen, never for a decision.';

-- Free text would let a stage arrive that the screen has no label for, and the
-- person would watch a blank line. These are the three the route walks
-- through, and they are the three section 10 names.
alter table public.panorama_jobs
  drop constraint if exists panorama_jobs_stage_known;
alter table public.panorama_jobs
  add constraint panorama_jobs_stage_known check (
    stage is null or stage in ('aligning', 'stitching', 'optimizing')
  );

-- A stage on a finished job is a leftover, and a leftover reads as "still
-- working" on a screen that is only looking at the stage.
alter table public.panorama_jobs
  drop constraint if exists panorama_jobs_stage_only_while_processing;
alter table public.panorama_jobs
  add constraint panorama_jobs_stage_only_while_processing check (
    stage is null or status = 'processing'
  );
