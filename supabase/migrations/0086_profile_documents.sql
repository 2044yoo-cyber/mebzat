-- A CV you upload once, and a company that is never asked for one.
--
-- `profiles` had one set of columns for every kind of account, so the edit form
-- had one set of questions. A construction firm was asked for years of
-- experience, which it does not have as a person; somebody looking for work was
-- given a `website` field and nowhere to put a CV, which is the document the
-- job actually turns on. Both of them then sat below 100% on the completion
-- bar for answering honestly.
--
-- The split is by account type, which already exists and already distinguishes
-- the two — `ORGANIZATION_ACCOUNT_TYPES` in the application. No second profile
-- table, no second user system: these are columns on the row that is already
-- there, and a column a given account type is never asked for is simply null
-- on that row.
--
-- ## The documents
--
-- `cv_path` and `portfolio_path` are storage paths, not URLs. A URL either
-- expires, which puts a dead link on an application somebody sent last month,
-- or does not expire, which is a CV on the open internet for anybody who
-- guesses it. A path is resolved to a signed URL at the moment somebody with
-- the right to read it asks for one, and the right to read it is the policy
-- below rather than knowledge of a string.
--
-- ## What an application carries
--
-- Two booleans rather than a copy of the file. Copying it into the job's
-- bucket would duplicate the document per application and freeze it at the
-- version it had that day — so an applicant who fixes a typo in their CV fixes
-- it for future employers only, which is not what "saved CV" means to anybody.
-- The flags say *use mine*, and the policy lets the employer read it.

begin;

-- ---------------------------------------------------------------------------
-- Profile columns
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists cv_path text,
  add column if not exists cv_filename text,
  add column if not exists cv_updated_at timestamptz,
  add column if not exists portfolio_path text,
  add column if not exists portfolio_filename text,
  add column if not exists portfolio_updated_at timestamptz,
  add column if not exists portfolio_link text,
  add column if not exists linkedin_url text,
  add column if not exists industry text,
  add column if not exists company_size text,
  add column if not exists font_preference text;

comment on column public.profiles.cv_path is
  'Path inside the profile-documents bucket. Not a URL: a URL either expires and leaves a dead link on an old application, or does not and puts a CV on the open internet.';
comment on column public.profiles.portfolio_link is
  'A portfolio that lives somewhere else — Behance, a personal site. Separate from portfolio_path, which is a file held here.';
comment on column public.profiles.industry is
  'What sector an organisation is in. Null for a person: the equivalent question for them is profession.';
comment on column public.profiles.font_preference is
  'Which reading face this account chose. Null means the default, which is the one that covers Ge''ez.';

-- A person has no industry and an organisation has no years of experience.
-- Not enforced as a constraint — an account type can change, and refusing the
-- update would mean somebody switching from individual to company has to empty
-- fields by hand first. The form asks the right questions; this documents it.

-- ---------------------------------------------------------------------------
-- What an application says about the applicant's saved documents
-- ---------------------------------------------------------------------------

alter table public.job_applications
  add column if not exists use_saved_cv boolean not null default false,
  add column if not exists use_saved_portfolio boolean not null default false;

comment on column public.job_applications.use_saved_cv is
  'The applicant offered the CV on their profile. Read live, so a corrected CV is corrected everywhere.';

-- Set through its own function rather than by widening `job_apply`.
--
-- `job_apply` is an eight-argument plpgsql function that four screens call.
-- Adding defaulted parameters to it means dropping and recreating it, because
-- `create or replace` with a different argument list makes an overload rather
-- than a replacement — and an accidental overload of an RPC is a bug that
-- surfaces as "function is not unique" at run time, on a call site nobody
-- touched. A second, small function is additive and cannot do that.
--
-- Security definer so the update is not blocked by whatever row-level policy
-- `job_applications` carries for updates today, and gated on `applicant_id`
-- inside — which is the check that matters and is stated here rather than
-- inherited.
create or replace function public.job_application_set_saved_documents(
  p_application uuid,
  p_cv boolean,
  p_portfolio boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.job_applications
  set use_saved_cv = coalesce(p_cv, false),
      use_saved_portfolio = coalesce(p_portfolio, false),
      updated_at = now()
  where id = p_application
    and applicant_id = auth.uid();

  if not found then
    raise exception 'That application is not yours.'
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

-- `from public` is not enough. A Supabase project carries
-- `alter default privileges in schema public grant execute on functions to
-- anon, authenticated, service_role`, so a function is granted to `anon` by
-- name the moment it is created — a grant that revoking PUBLIC does not
-- touch. `anon` has to be named.
revoke all on function public.job_application_set_saved_documents(uuid, boolean, boolean)
  from public, anon;
grant execute on function public.job_application_set_saved_documents(uuid, boolean, boolean)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------
--
-- Private. Path convention <profile_id>/<filename>, and the policy reads the
-- first folder segment as the owner — the same shape as job-files from 0033,
-- for the same reason: one bucket serves every profile without a policy each.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-documents',
  'profile-documents',
  false,
  10485760,
  array[
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do nothing;

drop policy if exists "owners manage their documents" on storage.objects;
create policy "owners manage their documents"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'profile-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'profile-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- An employer reads the CV of somebody who applied to their job, and nobody
-- else's. Written as an application that offered it — `use_saved_cv` — so
-- withdrawing the offer withdraws the access, and applying to one job does not
-- open the document to every employer on the platform.
drop policy if exists "employers read an applicant's offered documents" on storage.objects;
create policy "employers read an applicant's offered documents"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'profile-documents'
    and exists (
      select 1
      from public.job_applications a
      join public.jobs j on j.id = a.job_id
      where j.poster_id = auth.uid()
        and a.applicant_id::text = (storage.foldername(name))[1]
        and a.status <> 'withdrawn'
        and (a.use_saved_cv or a.use_saved_portfolio)
    )
  );

commit;
