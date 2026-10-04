-- A CV is readable by its owner, and by an employer it was offered to. Nobody
-- else.
--
-- Run after applying 0086. Prints one line per check and rolls itself back.
-- The policies are exercised as `authenticated` with a jwt subject, because a
-- superuser bypasses row-level security and a test that runs as one proves
-- nothing about the policy it is named after.

begin;

insert into auth.users (id, email) values
  ('77700000-0000-4000-8000-000000000001', 'seeker@example.test'),
  ('77700000-0000-4000-8000-000000000002', 'employer@example.test'),
  ('77700000-0000-4000-8000-000000000003', 'stranger@example.test'),
  ('77700000-0000-4000-8000-000000000004', 'otheremployer@example.test')
on conflict (id) do nothing;

update public.profiles set
  username = 'doc_seeker', full_name = 'Hana Woldemariam',
  account_type = 'individual', location_city = 'Ayertena',
  cv_path = '77700000-0000-4000-8000-000000000001/cv.pdf',
  cv_filename = 'hana_cv.pdf',
  portfolio_path = '77700000-0000-4000-8000-000000000001/portfolio.pdf'
where id = '77700000-0000-4000-8000-000000000001';

update public.profiles set
  username = 'doc_employer', company_name = 'Abyssinia Build PLC',
  account_type = 'company', industry = 'Construction', location_city = 'Bole'
where id = '77700000-0000-4000-8000-000000000002';

update public.profiles set
  username = 'doc_stranger', full_name = 'Passing Stranger',
  account_type = 'individual'
where id = '77700000-0000-4000-8000-000000000003';

update public.profiles set
  username = 'doc_other', company_name = 'Unrelated Firm',
  account_type = 'company'
where id = '77700000-0000-4000-8000-000000000004';

insert into public.jobs (id, poster_id, title, slug, description, status)
values (
  '77700000-0000-4000-8000-00000000000a',
  '77700000-0000-4000-8000-000000000002',
  'Carpenter for a fit-out',
  'probe-carpenter-fit-out',
  'Shopfitting in Bole, six weeks.',
  'open'
), (
  '77700000-0000-4000-8000-00000000000b',
  '77700000-0000-4000-8000-000000000004',
  'Welder',
  'probe-welder-gates',
  'Gates and handrails.',
  'open'
);

insert into public.job_applications (id, job_id, applicant_id, use_saved_cv)
values (
  '77700000-0000-4000-8000-00000000000c',
  '77700000-0000-4000-8000-00000000000a',
  '77700000-0000-4000-8000-000000000001',
  true
), (
  -- The stranger applies to the *other* employer's job, and offers their CV.
  -- Without this row section 3b proves nothing: dropping the applicant check
  -- from the policy leaves the other employer with no application at all, so
  -- the EXISTS is false for the wrong reason and the mutant reads as caught.
  '77700000-0000-4000-8000-00000000000d',
  '77700000-0000-4000-8000-00000000000b',
  '77700000-0000-4000-8000-000000000003',
  true
);

-- The object itself. `owner` is left null deliberately: the policies read the
-- path, not the uploader, because a file's folder is what says whose it is.
insert into storage.objects (bucket_id, name, path_tokens)
values (
  'profile-documents',
  '77700000-0000-4000-8000-000000000001/cv.pdf',
  string_to_array('77700000-0000-4000-8000-000000000001/cv.pdf', '/')
);

set role authenticated;

-- ===================================================================
-- 1. The owner.
-- ===================================================================
set local request.jwt.claim.sub = '77700000-0000-4000-8000-000000000001';
do $$
declare n integer;
begin
  select count(*) into n from storage.objects
  where bucket_id = 'profile-documents'
    and name = '77700000-0000-4000-8000-000000000001/cv.pdf';
  if n <> 1 then
    raise exception 'FAIL 1a: the owner cannot read their own CV';
  end if;
  raise notice 'ok 1a: the owner reads their own CV';

  insert into storage.objects (bucket_id, name, path_tokens)
  values (
    'profile-documents',
    '77700000-0000-4000-8000-000000000001/second.pdf',
    string_to_array('77700000-0000-4000-8000-000000000001/second.pdf', '/')
  );
  raise notice 'ok 1b: and can upload another into their own folder';
end;
$$;

do $$
begin
  begin
    insert into storage.objects (bucket_id, name, path_tokens)
    values (
      'profile-documents',
      '77700000-0000-4000-8000-000000000003/planted.pdf',
      string_to_array('77700000-0000-4000-8000-000000000003/planted.pdf', '/')
    );
    raise exception 'FAIL 1c: wrote a document into somebody else''s folder';
  exception
    when insufficient_privilege then
      raise notice 'ok 1c: but not into somebody else''s folder';
  end;
end;
$$;

-- ===================================================================
-- 2. The employer the CV was offered to.
-- ===================================================================
set local request.jwt.claim.sub = '77700000-0000-4000-8000-000000000002';
do $$
declare n integer;
begin
  select count(*) into n from storage.objects
  where bucket_id = 'profile-documents'
    and name = '77700000-0000-4000-8000-000000000001/cv.pdf';
  if n <> 1 then
    raise exception 'FAIL 2a: the employer cannot read a CV that was offered to them';
  end if;
  raise notice 'ok 2a: an employer reads the CV of somebody who applied to their job';
end;
$$;

do $$
begin
  begin
    delete from storage.objects
    where bucket_id = 'profile-documents'
      and name = '77700000-0000-4000-8000-000000000001/cv.pdf';
    if found then
      raise exception 'FAIL 2b: the employer deleted the applicant''s CV';
    end if;
    raise notice 'ok 2b: but cannot delete it — reading is all they were given';
  exception
    when insufficient_privilege then
      raise notice 'ok 2b: but cannot delete it — reading is all they were given';
  end;
end;
$$;

-- ===================================================================
-- 3. Everybody else.
-- ===================================================================
set local request.jwt.claim.sub = '77700000-0000-4000-8000-000000000003';
do $$
declare n integer;
begin
  select count(*) into n from storage.objects
  where bucket_id = 'profile-documents'
    and name = '77700000-0000-4000-8000-000000000001/cv.pdf';
  if n <> 0 then
    raise exception 'FAIL 3a: a stranger read somebody''s CV';
  end if;
  raise notice 'ok 3a: a stranger reads nothing';
end;
$$;

set local request.jwt.claim.sub = '77700000-0000-4000-8000-000000000004';
do $$
declare n integer;
begin
  select count(*) into n from storage.objects
  where bucket_id = 'profile-documents'
    and name = '77700000-0000-4000-8000-000000000001/cv.pdf';
  if n <> 0 then
    raise exception 'FAIL 3b: an employer read the CV of somebody who never applied to them';
  end if;
  raise notice 'ok 3b: an application from one person does not open another person''s CV';
end;
$$;

-- ===================================================================
-- 4. Withdrawing the offer withdraws the access.
--
-- This is why the policy reads `use_saved_cv` and the application's status
-- rather than merely "an application exists". An applicant who unticks the box
-- has taken the document back, and an applicant who withdraws has taken the
-- whole application back.
-- ===================================================================
reset role;
update public.job_applications set use_saved_cv = false
where id = '77700000-0000-4000-8000-00000000000c';
set role authenticated;

set local request.jwt.claim.sub = '77700000-0000-4000-8000-000000000002';
do $$
declare n integer;
begin
  select count(*) into n from storage.objects
  where bucket_id = 'profile-documents'
    and name = '77700000-0000-4000-8000-000000000001/cv.pdf';
  if n <> 0 then
    raise exception 'FAIL 4a: unticking "use my saved CV" left the employer reading it';
  end if;
  raise notice 'ok 4a: unticking the offer closes the document';
end;
$$;

reset role;
update public.job_applications
set use_saved_cv = true, status = 'withdrawn'
where id = '77700000-0000-4000-8000-00000000000c';
set role authenticated;

set local request.jwt.claim.sub = '77700000-0000-4000-8000-000000000002';
do $$
declare n integer;
begin
  select count(*) into n from storage.objects
  where bucket_id = 'profile-documents'
    and name = '77700000-0000-4000-8000-000000000001/cv.pdf';
  if n <> 0 then
    raise exception 'FAIL 4b: a withdrawn application still opened the CV';
  end if;
  raise notice 'ok 4b: withdrawing the application closes it too';
end;
$$;

-- ===================================================================
-- 4c. The bucket is private.
--
-- Not a policy question. A public bucket serves every object in it over plain
-- HTTP whatever the policies say, so the four sections above would all still
-- pass while every CV on the platform was one guessed path from being read.
-- ===================================================================
reset role;
do $$
declare is_public boolean;
begin
  select public into is_public from storage.buckets where id = 'profile-documents';
  if is_public is not false then
    raise exception 'FAIL 4c: the profile-documents bucket is public';
  end if;
  raise notice 'ok 4c: the bucket is private, so the policies are what decide';
end;
$$;

-- ===================================================================
-- 4d. The employer policy names the job's poster.
--
-- The one assertion here about the policy's text rather than its behaviour,
-- and it is deliberate. `job_applications` has its own row-level security, and
-- it already hides an application from anybody who is neither the applicant
-- nor the job's poster — which means the `j.poster_id = auth.uid()` clause in
-- the storage policy changes no outcome that can be reached from a session.
--
-- It stays anyway, and this pins it. A storage policy whose correctness
-- depends on a *different* table's policy staying correct is a policy that
-- breaks silently when that one is relaxed, and the relaxation will be in
-- another file, for another reason, reviewed by somebody not thinking about
-- CVs.
-- ===================================================================
do $$
declare expression text;
begin
  select pg_get_expr(polqual, polrelid) into expression
  from pg_policy
  where polrelid = 'storage.objects'::regclass
    and polname = 'employers read an applicant''s offered documents';

  if expression is null then
    raise exception 'FAIL 4d: the employer read policy is missing';
  end if;
  if expression not like '%poster_id%' then
    raise exception 'FAIL 4d: the policy no longer says whose job it has to be';
  end if;
  raise notice 'ok 4d: the policy states the poster clause itself rather than inheriting it';
end;
$$;

-- ===================================================================
-- 4e. Only the applicant can change what their application offers.
-- ===================================================================
set role authenticated;
set local request.jwt.claim.sub = '77700000-0000-4000-8000-000000000002';
do $$
begin
  begin
    perform public.job_application_set_saved_documents(
      '77700000-0000-4000-8000-00000000000c', true, true);
    raise exception 'FAIL 4e: an employer turned the applicant''s CV offer back on';
  exception
    when insufficient_privilege then
      raise notice 'ok 4e: an employer cannot re-offer a document the applicant took back';
  end;
end;
$$;

set local request.jwt.claim.sub = '77700000-0000-4000-8000-000000000001';
do $$
declare offered boolean;
begin
  -- Both directions, from a known starting state. Asserting only that it can
  -- be turned *on* passes when the function assigns the column to itself,
  -- because sections above have already left it on.
  perform public.job_application_set_saved_documents(
    '77700000-0000-4000-8000-00000000000c', false, false);
  select use_saved_cv into offered from public.job_applications
  where id = '77700000-0000-4000-8000-00000000000c';
  if offered is not false then
    raise exception 'FAIL 4f: the applicant could not take their CV back';
  end if;

  perform public.job_application_set_saved_documents(
    '77700000-0000-4000-8000-00000000000c', true, true);
  select use_saved_cv into offered from public.job_applications
  where id = '77700000-0000-4000-8000-00000000000c';
  if offered is not true then
    raise exception 'FAIL 4f: the applicant could not offer their own CV';
  end if;
  raise notice 'ok 4f: but the applicant can, both ways';
end;
$$;

-- A signed-out visitor has no application to change. The function would refuse
-- one anyway — `auth.uid()` is null, so nothing matches — but that is the
-- function defending itself, and the grant list is where it is supposed to be
-- said.
reset role;
do $$
begin
  if has_function_privilege('anon',
    'public.job_application_set_saved_documents(uuid, boolean, boolean)', 'execute')
  then
    raise exception 'FAIL 4g: a signed-out visitor may call the saved-documents function';
  end if;
  raise notice 'ok 4g: and a signed-out visitor may not call it at all';
end;
$$;
set role authenticated;

-- ===================================================================
-- 5. The columns hold what they are for.
-- ===================================================================
reset role;
do $$
declare p record;
begin
  select cv_path, cv_filename, industry, font_preference, portfolio_path
  into p from public.profiles
  where id = '77700000-0000-4000-8000-000000000001';

  if p.cv_path is null or p.cv_filename is null then
    raise exception 'FAIL 5a: the CV columns did not take a value';
  end if;
  raise notice 'ok 5a: a CV is a path and a filename, not a URL';

  if p.industry is not null then
    raise exception 'FAIL 5b: a person was given an industry';
  end if;
  raise notice 'ok 5b: a person has no industry, and that is null rather than blank';

  if p.font_preference is not null then
    raise exception 'FAIL 5c: a font preference appeared from nowhere';
  end if;
  raise notice 'ok 5c: no font preference means the default';

  select industry into p from public.profiles
  where id = '77700000-0000-4000-8000-000000000002';
  if p.industry <> 'Construction' then
    raise exception 'FAIL 5d: an organisation could not record its industry';
  end if;
  raise notice 'ok 5d: an organisation records its industry';
end;
$$;

rollback;
