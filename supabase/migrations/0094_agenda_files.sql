-- A bucket for what a project actually holds.
--
-- 0024 created `agenda_attachments` with a `url` column and a server action to
-- write it, and nothing ever uploaded anything: there was no bucket. 0090
-- added `agenda_photos.storage_path` in the same state. Both have been columns
-- describing files that could not exist.
--
-- One private bucket, keyed by project. Not public: a site photograph shows a
-- client's building, its progress and often its security arrangements, and
-- "unlisted URL" is not a permission. Not a bucket per project either — that
-- is a policy per project, and the point of `agenda_is_member` is that there
-- is one rule.
--
-- ## Why the path starts with the project id
--
-- `storage.foldername(name)[1]` is the only part of an object's name a policy
-- can cheaply match on, so the first segment has to be the thing access is
-- decided by. Membership of the project is that thing, and it is asked with
-- the same function every table in 0024, 0089, 0090 and 0091 asks.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'agenda-files',
  'agenda-files',
  false,
  -- 25 MB. A site photograph off a phone is 3 to 8; a scanned drawing set is
  -- the thing this has to hold, and a limit low enough to refuse one would
  -- send people back to sharing files by other means.
  26214400,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'application/pdf',
    'video/mp4', 'video/quicktime', 'video/webm',
    'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/webm',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    -- A DWG or an RVT arrives as octet-stream: the browser has no idea what it
    -- is, and refusing it on that basis would refuse every drawing anybody
    -- tried to upload.
    'application/octet-stream'
  ]
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Members of the project read what is filed under it.
--
-- `(storage.foldername(name))[1]` is the project id. It is cast rather than
-- compared as text because `agenda_is_member` takes a uuid, and a name whose
-- first segment is not a uuid would raise — so the cast is guarded by a
-- pattern match that costs nothing and turns a crash into a refusal.
drop policy if exists "agenda files: members read" on storage.objects;
create policy "agenda files: members read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'agenda-files'
    and (storage.foldername(name))[1] ~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and public.agenda_is_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "agenda files: members upload" on storage.objects;
create policy "agenda files: members upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'agenda-files'
    and (storage.foldername(name))[1] ~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and public.agenda_is_member(((storage.foldername(name))[1])::uuid)
  );

-- No update and no delete policy, which is the rule the rest of Agenda
-- follows: nothing is deleted. A photograph filed in error is archived by the
-- row that points at it, and the object stays where the audit trail says it
-- is.

commit;
