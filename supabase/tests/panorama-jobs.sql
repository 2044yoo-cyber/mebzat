-- A 360 capture, from the first frame to the published panorama.
--
-- Run after applying 0081. Prints one line per check and rolls itself back.
-- Run as `authenticated` wherever the question is "may a browser do this?",
-- because the guard on the result is written in terms of `current_user`: a
-- superuser run would report it working while it permitted everything.
--
--   PGHOST=/tmp/pgwmrun PGPORT=54329 psql -d medosha_t -f supabase/tests/panorama-jobs.sql
--
-- What is actually at stake here: a job row is the only thing that says a
-- panorama exists and where it is. If a browser can write that row, it can
-- publish any URL it likes as a finished 360 photo of somebody's house, and
-- every bit of the moderation path 0058 built is walked straight past.

begin;

insert into auth.users (id, email) values
  ('77700000-0000-4000-8000-000000000001', 'panner@example.test'),
  ('77700000-0000-4000-8000-000000000002', 'stranger@example.test')
on conflict (id) do nothing;

update public.profiles set username = 'probe_panner'
  where id = '77700000-0000-4000-8000-000000000001';
update public.profiles set username = 'probe_pan_stranger'
  where id = '77700000-0000-4000-8000-000000000002';

-- ===================================================================
-- 1. Starting a capture.
-- ===================================================================
set role authenticated;
set local request.jwt.claim.sub = '77700000-0000-4000-8000-000000000001';

insert into public.panorama_jobs (id, owner_id, expected_frames)
values ('88800000-0000-4000-8000-000000000001',
        '77700000-0000-4000-8000-000000000001', 9);

do $$
declare j public.panorama_jobs;
begin
  select * into j from public.panorama_jobs
  where id = '88800000-0000-4000-8000-000000000001';

  if j.status <> 'capturing' then
    raise exception 'FAIL 1a: a new job started at %, not capturing', j.status;
  end if;
  raise notice 'ok 1a: a new job starts as a capture in progress';

  if j.panorama_url is not null then
    raise exception 'FAIL 1b: a job with no frames already claims a panorama';
  end if;
  raise notice 'ok 1b: and claims no panorama yet';
end;
$$;

do $$
begin
  insert into public.panorama_jobs (owner_id)
  values ('77700000-0000-4000-8000-000000000002');
  raise exception 'FAIL 1c: a member opened a capture in somebody else''s name';
exception
  when insufficient_privilege then
    raise notice 'ok 1c: a capture can only be started for yourself';
end;
$$;

-- ===================================================================
-- 2. Progress is the client's to report. The result is not.
--
--    The phone knows how many frames it has sent, and nothing else
--    does, so `uploading` and `processing` have to be writable from a
--    browser. `ready` and `panorama_url` are the two facts only the
--    server can be telling the truth about.
-- ===================================================================
update public.panorama_jobs
set status = 'uploading',
    uploaded_frames = 9,
    frames_prefix = '77700000-0000-4000-8000-000000000001/88800000-0000-4000-8000-000000000001'
where id = '88800000-0000-4000-8000-000000000001';

do $$
declare j public.panorama_jobs;
begin
  select * into j from public.panorama_jobs
  where id = '88800000-0000-4000-8000-000000000001';
  if j.status <> 'uploading' or j.uploaded_frames <> 9 then
    raise exception 'FAIL 2a: the phone could not report its own progress (% / %)',
      j.status, j.uploaded_frames;
  end if;
  raise notice 'ok 2a: the phone reports its own upload progress';
end;
$$;

do $$
begin
  update public.panorama_jobs
  set status = 'ready', panorama_url = 'https://evil.example/anything.jpg'
  where id = '88800000-0000-4000-8000-000000000001';
  raise exception 'FAIL 2b: a browser published a panorama of its own choosing';
exception
  when insufficient_privilege then
    raise notice 'ok 2b: a browser cannot publish a panorama of its own choosing';
end;
$$;

do $$
begin
  update public.panorama_jobs
  set panorama_url = 'https://evil.example/anything.jpg'
  where id = '88800000-0000-4000-8000-000000000001';
  raise exception 'FAIL 2c: a browser wrote the panorama URL without saying ready';
exception
  when insufficient_privilege then
    raise notice 'ok 2c: and cannot write the URL by itself either';
end;
$$;

do $$
declare j public.panorama_jobs;
begin
  select * into j from public.panorama_jobs
  where id = '88800000-0000-4000-8000-000000000001';
  if j.panorama_url is not null or j.status = 'ready' then
    raise exception 'FAIL 2d: a refused update left its values behind anyway';
  end if;
  raise notice 'ok 2d: nothing of the refused update survived';
end;
$$;

-- Both halves of the guard, separately.
--
-- 2b changes the status *and* the URL, so it is refused whichever half of the
-- guard is still standing — which means on its own it proves neither. Here the
-- server has already written a URL and the browser changes nothing but the
-- status, so only the status half can refuse it.
reset role;
update public.panorama_jobs
set panorama_url = 'https://cdn.example/panoramas/half-done.jpg',
    status = 'processing'
where id = '88800000-0000-4000-8000-000000000001';

set role authenticated;
set local request.jwt.claim.sub = '77700000-0000-4000-8000-000000000001';

do $$
begin
  update public.panorama_jobs
  set status = 'ready'
  where id = '88800000-0000-4000-8000-000000000001';
  raise exception 'FAIL 2f: a browser marked a job ready without touching the URL';
exception
  when insufficient_privilege then
    raise notice 'ok 2f: ready is the server''s word, even over a URL the server wrote';
end;
$$;

reset role;
update public.panorama_jobs set panorama_url = null
where id = '88800000-0000-4000-8000-000000000001';
set role authenticated;
set local request.jwt.claim.sub = '77700000-0000-4000-8000-000000000001';

-- A failure is the client's to record: the stitch route reports it, and the
-- route runs as the caller.
update public.panorama_jobs
set status = 'failed', error_code = 'low_overlap'
where id = '88800000-0000-4000-8000-000000000001';

do $$
begin
  update public.panorama_jobs
  set status = 'failed', error_code = null
  where id = '88800000-0000-4000-8000-000000000001';
  raise exception 'FAIL 2e: a job failed for no stated reason';
exception
  when check_violation then
    raise notice 'ok 2e: a failure has to say why, or there is nothing to tell anybody';
end;
$$;

-- ===================================================================
-- 3. Somebody else's capture.
-- ===================================================================
set local request.jwt.claim.sub = '77700000-0000-4000-8000-000000000002';

do $$
declare seen integer;
begin
  select count(*) into seen from public.panorama_jobs
  where id = '88800000-0000-4000-8000-000000000001';
  if seen <> 0 then
    raise exception 'FAIL 3a: a stranger can read somebody else''s capture';
  end if;
  raise notice 'ok 3a: a capture is invisible to everybody but its owner';

  update public.panorama_jobs
  set status = 'failed', error_code = 'unknown'
  where id = '88800000-0000-4000-8000-000000000001';
  if found then
    raise exception 'FAIL 3b: a stranger changed somebody else''s capture';
  end if;
  raise notice 'ok 3b: and cannot be changed by them';

  delete from public.panorama_jobs
  where id = '88800000-0000-4000-8000-000000000001';
  if found then
    raise exception 'FAIL 3c: a stranger deleted somebody else''s capture';
  end if;
  raise notice 'ok 3c: nor deleted';
end;
$$;

-- 3b and 3c above are real, but they are not evidence about the update and
-- delete policies: Postgres applies the SELECT policy when an UPDATE or a
-- DELETE looks a row up, so both would still affect nothing if those two
-- policies were opened to everybody. Opening them is exactly the mistake worth
-- catching, so the policies themselves are read here.
do $$
declare pol record;
begin
  select qual, with_check into pol from pg_policies
  where schemaname = 'public' and tablename = 'panorama_jobs' and cmd = 'UPDATE';
  if pol is null then
    raise exception 'FAIL 3d: nothing says who may change a capture';
  end if;
  if pol.qual not like '%owner_id%' or pol.with_check not like '%owner_id%' then
    raise exception 'FAIL 3d: the update policy is not scoped to the owner — % / %',
      pol.qual, pol.with_check;
  end if;
  raise notice 'ok 3d: and the update policy names the owner on both sides';

  select qual into pol from pg_policies
  where schemaname = 'public' and tablename = 'panorama_jobs' and cmd = 'DELETE';
  if pol is null then
    raise exception 'FAIL 3e: nothing says who may delete a capture';
  end if;
  if pol.qual not like '%owner_id%' then
    raise exception 'FAIL 3e: the delete policy is not scoped to the owner — %', pol.qual;
  end if;
  raise notice 'ok 3e: as does the delete policy';
end;
$$;

-- ===================================================================
-- 4. The server finishes the job.
-- ===================================================================
reset role;

update public.panorama_jobs
set status = 'ready',
    panorama_url = 'https://cdn.example/panoramas/room.jpg',
    width = 3626, height = 1813,
    error_code = null
where id = '88800000-0000-4000-8000-000000000001';

do $$
declare j public.panorama_jobs;
begin
  select * into j from public.panorama_jobs
  where id = '88800000-0000-4000-8000-000000000001';
  if j.status <> 'ready' or j.panorama_url is null then
    raise exception 'FAIL 4a: the server could not record a finished panorama';
  end if;
  raise notice 'ok 4a: the server records the finished panorama';
end;
$$;

do $$
begin
  insert into public.panorama_jobs (owner_id, status)
  values ('77700000-0000-4000-8000-000000000001', 'ready');
  raise exception 'FAIL 4b: a job is ready with no image to show';
exception
  when check_violation then
    raise notice 'ok 4b: ready means there is an image, even for the server';
end;
$$;

do $$
begin
  insert into public.panorama_jobs (owner_id, expected_frames)
  values ('77700000-0000-4000-8000-000000000001', 41);
  raise exception 'FAIL 4c: a capture claimed 41 frames';
exception
  when check_violation then
    raise notice 'ok 4c: a frame count has a ceiling, so storage is not one either';
end;
$$;

-- ===================================================================
-- 5. The frames are temporary, and cleaning them up is not the
--    browser's job.
-- ===================================================================
update public.panorama_jobs
set frames_expire_at = now() - interval '1 hour'
where id = '88800000-0000-4000-8000-000000000001';

insert into public.panorama_jobs (id, owner_id, frames_prefix, frames_expire_at)
values ('88800000-0000-4000-8000-000000000002',
        '77700000-0000-4000-8000-000000000001',
        '77700000-0000-4000-8000-000000000001/fresh',
        now() + interval '1 hour');

do $$
declare due integer;
begin
  select count(*) into due from public.expired_panorama_frames(100);
  if due <> 1 then
    raise exception 'FAIL 5a: % jobs due for cleanup, expected exactly the expired one', due;
  end if;
  raise notice 'ok 5a: only frames past their time are swept';

  perform public.forget_panorama_frames('88800000-0000-4000-8000-000000000001');
  select count(*) into due from public.expired_panorama_frames(100);
  if due <> 0 then
    raise exception 'FAIL 5b: a swept job came back round again';
  end if;
  raise notice 'ok 5b: and a swept job is not swept twice';
end;
$$;

set role authenticated;
set local request.jwt.claim.sub = '77700000-0000-4000-8000-000000000001';

do $$
begin
  perform public.expired_panorama_frames(100);
  raise exception 'FAIL 5c: a browser can list everybody''s frame folders';
exception
  when insufficient_privilege then
    raise notice 'ok 5c: the sweeper is not reachable from a browser';
end;
$$;

do $$
begin
  perform public.forget_panorama_frames('88800000-0000-4000-8000-000000000002');
  raise exception 'FAIL 5d: a browser can clear anybody''s frame bookkeeping';
exception
  when insufficient_privilege then
    raise notice 'ok 5d: nor is forgetting them';
end;
$$;

-- ===================================================================
-- 6. The frames bucket. Raw frames of the inside of a house.
-- ===================================================================
reset role;

do $$
declare b storage.buckets;
begin
  select * into b from storage.buckets where id = 'panorama-frames';
  if b.id is null then
    raise exception 'FAIL 6a: there is nowhere to put the frames';
  end if;
  if b.public then
    raise exception 'FAIL 6a: the frames bucket is public';
  end if;
  raise notice 'ok 6a: the frames bucket is private';

  if b.file_size_limit is null or b.file_size_limit > 8388608 then
    raise exception 'FAIL 6b: no usable ceiling on a frame (%)', b.file_size_limit;
  end if;
  raise notice 'ok 6b: and a frame has a size ceiling';

  if b.allowed_mime_types is null
     or not (b.allowed_mime_types @> array['image/jpeg']) then
    raise exception 'FAIL 6c: the frames bucket does not restrict its types';
  end if;
  if b.allowed_mime_types @> array['text/html'] then
    raise exception 'FAIL 6c: the frames bucket accepts HTML';
  end if;
  raise notice 'ok 6c: photographs only';
end;
$$;

insert into storage.objects (bucket_id, name) values
  ('panorama-frames', '77700000-0000-4000-8000-000000000001/job/000_000.jpg'),
  ('panorama-frames', '77700000-0000-4000-8000-000000000002/job/000_000.jpg');

set role authenticated;
set local request.jwt.claim.sub = '77700000-0000-4000-8000-000000000001';

do $$
declare seen integer;
begin
  select count(*) into seen from storage.objects
  where bucket_id = 'panorama-frames'
    and name like '77700000-0000-4000-8000-000000000002/%';
  if seen <> 0 then
    raise exception 'FAIL 6d: a member can read somebody else''s room';
  end if;
  raise notice 'ok 6d: frames are readable only by the person who took them';

  select count(*) into seen from storage.objects
  where bucket_id = 'panorama-frames'
    and name like '77700000-0000-4000-8000-000000000001/%';
  if seen <> 1 then
    raise exception 'FAIL 6e: the owner cannot read their own frames (% rows)', seen;
  end if;
  raise notice 'ok 6e: and are readable by them';

  begin
    insert into storage.objects (bucket_id, name)
    values ('panorama-frames', '77700000-0000-4000-8000-000000000002/job/planted.jpg');
    raise exception 'FAIL 6f: a member wrote a frame into somebody else''s folder';
  exception
    when insufficient_privilege then
      raise notice 'ok 6f: a member cannot write into somebody else''s folder';
  end;

  begin
    delete from storage.objects
    where bucket_id = 'panorama-frames'
      and name like '77700000-0000-4000-8000-000000000002/%';
    if found then
      raise exception 'FAIL 6g: a member deleted somebody else''s frames';
    end if;
    raise notice 'ok 6g: nor delete from it';
  end;
end;
$$;

-- And, as with 3d, the delete policy itself — because the read policy is what
-- stops the delete above from finding anything, so that check would go on
-- passing with the delete policy opened to everybody signed in.
do $$
declare q text;
begin
  select qual into q from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname = 'members delete their own panorama frames';
  if q is null then
    raise exception 'FAIL 6h: nothing says who may delete a frame';
  end if;
  if q not like '%auth.uid()%' or q not like '%foldername%' then
    raise exception 'FAIL 6h: the delete policy is not scoped to the uploader — %', q;
  end if;
  raise notice 'ok 6h: and the frame delete policy is scoped to the folder''s owner';
end;
$$;

rollback;
