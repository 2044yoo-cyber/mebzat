-- Jobs — the operations that reach another person.
--
-- Everything a member does to their own rows already passes the policies from
-- 0012 and 0033: posting a job, editing it, saving one, writing an
-- application. None of that belongs in a function.
--
-- These five do, and for one reason: each of them writes to a table the actor
-- does not own — an application on somebody else's job, a hire, an interview —
-- so they are security definer, and each one checks for itself what the policy
-- would have checked.
--
-- What they deliberately do *not* do is write notifications.
--
-- 0012 already notifies on an application and on a status change, with two
-- triggers on `job_applications`. Adding an insert to these functions as well
-- would send every applicant two of everything. So the triggers stay the one
-- place a job notification is written, and this file corrects them instead:
-- they now route to the right person and say something a member can read.
--
-- Every function is `create or replace`, so this file can be re-run.

begin;

do $$
begin
  if to_regclass('public.job_hires') is null then
    raise exception using
      message = 'Jobs: public.job_hires does not exist.',
      hint = 'Run 0032_jobs_enums.sql, then 0033_jobs.sql, then this file.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The one notification path
-- ---------------------------------------------------------------------------

/**
 * Tells the employer that somebody applied.
 *
 * Replaces the 0012 version to land on the applications page rather than the
 * public posting. An employer following that notification wants the pipeline,
 * not the advert they wrote themselves.
 */
create or replace function public.notify_job_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  job public.jobs;
  actor text;
begin
  select * into job from public.jobs where id = new.job_id;
  if job.poster_id = new.applicant_id then
    return new;
  end if;

  select coalesce(full_name, company_name, username, 'Someone')
  into actor from public.profiles where id = new.applicant_id;

  insert into public.notifications (user_id, actor_id, kind, title, body, href)
  values (
    job.poster_id,
    new.applicant_id,
    'job_application',
    actor || ' applied for ' || job.title,
    left(coalesce(new.proposal, new.cover_letter, ''), 120),
    '/jobs/' || job.id || '/applications'
  );
  return new;
end;
$$;

/**
 * Tells whoever did not cause the change.
 *
 * The 0012 version always wrote to the applicant, which is right for four of
 * the six transitions and wrong for the two the applicant makes themselves: an
 * applicant who withdraws was being told they had withdrawn, while the
 * employer — the person who needed to know — was told nothing.
 *
 * The wording is written out rather than interpolated from the enum, because
 * "is now offered" is not a sentence anybody would write.
 */
create or replace function public.notify_application_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  job public.jobs;
  headline text;
  audience uuid;
  note public.notification_kind := 'application_update';
begin
  if new.status = old.status then
    return new;
  end if;

  select * into job from public.jobs where id = new.job_id;

  if new.status = 'withdrawn' then
    -- The applicant's own doing, so the employer is the one who has not heard.
    audience := job.poster_id;
    headline := 'An application was withdrawn';
  elsif old.status = 'withdrawn' then
    -- Applying again after withdrawing. `job_apply` reaches this by update
    -- rather than insert, so without this branch the second application would
    -- arrive silently.
    audience := job.poster_id;
    note := 'job_application';
    headline := 'An application was resubmitted';
  else
    audience := new.applicant_id;
    headline := case new.status
      when 'reviewing' then 'Your application is being reviewed'
      when 'shortlisted' then 'You have been shortlisted'
      when 'interviewing' then 'You have been invited to interview'
      when 'offered' then 'You have received an offer'
      when 'hired' then 'You have been hired'
      when 'rejected' then 'Your application was not successful'
      else 'Your application was updated'
    end;
    if new.status = 'hired' then
      note := 'job_hired';
    end if;
  end if;

  insert into public.notifications (user_id, kind, title, body, href)
  values (
    audience,
    note,
    headline,
    job.title,
    case
      when audience = job.poster_id then '/jobs/' || job.id || '/applications'
      else '/jobs/' || job.id
    end
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Applying
-- ---------------------------------------------------------------------------

create or replace function public.job_apply(
  p_job uuid,
  p_cover_letter text default null,
  p_proposal text default null,
  p_cv_url text default null,
  p_portfolio_url text default null,
  p_expected numeric default null,
  p_available_from date default null,
  p_availability_note text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  j public.jobs%rowtype;
  application_id uuid;
begin
  if uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into j from public.jobs where id = p_job;
  if not found then
    raise exception 'job not found' using errcode = 'P0002';
  end if;

  -- Security definer bypasses the read policy, so a draft or a private job
  -- must not become applicable by guessing an id. A private job is reachable
  -- by link on purpose, so it is applicable; a draft never is.
  if j.status <> 'open' then
    raise exception 'this job is not accepting applications' using errcode = 'P0002';
  end if;

  -- Posting a job and then applying to it is not a thing anyone means to do.
  if j.poster_id = uid then
    raise exception 'you cannot apply to your own job' using errcode = '22023';
  end if;

  insert into public.job_applications (
    job_id, applicant_id, cover_letter, proposal, cv_url, portfolio_url,
    expected_salary, available_from, availability_note, status
  )
  values (
    j.id, uid, p_cover_letter, p_proposal, p_cv_url, p_portfolio_url,
    p_expected, p_available_from, p_availability_note, 'submitted'
  )
  -- Applying twice is an edit of the first application, which is what the
  -- unique constraint from 0012 already says. Re-applying after withdrawing
  -- puts it back in front of the employer.
  on conflict (job_id, applicant_id) do update
    set cover_letter = excluded.cover_letter,
        proposal = excluded.proposal,
        cv_url = excluded.cv_url,
        portfolio_url = excluded.portfolio_url,
        expected_salary = excluded.expected_salary,
        available_from = excluded.available_from,
        availability_note = excluded.availability_note,
        status = case
          when public.job_applications.status = 'withdrawn' then 'submitted'
          else public.job_applications.status
        end,
        withdrawn_at = null,
        updated_at = now()
  returning id into application_id;

  -- No notification here. `job_applications_notify` covers a first
  -- application, and `job_applications_status_notify` covers the withdrawn →
  -- submitted case above. Writing one here as well would send two.

  return application_id;
end;
$$;

grant execute on function
  public.job_apply(uuid, text, text, text, text, numeric, date, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Moving an application through the pipeline
-- ---------------------------------------------------------------------------

create or replace function public.job_set_application_status(
  p_application uuid,
  p_status public.application_status
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  a public.job_applications%rowtype;
  j public.jobs%rowtype;
begin
  if uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into a from public.job_applications where id = p_application;
  if not found then
    raise exception 'application not found' using errcode = 'P0002';
  end if;

  select * into j from public.jobs where id = a.job_id;

  if j.poster_id <> uid then
    raise exception 'application not found' using errcode = 'P0002';
  end if;

  -- Hiring is not a status change. It creates an agreement and a conversation,
  -- and `job_hire` is where that happens — allowing it here would let an
  -- application say "hired" with no agreement behind it.
  if p_status = 'hired' then
    raise exception 'use job_hire to hire an applicant' using errcode = '22023';
  end if;

  -- Withdrawing belongs to the applicant. An employer who no longer wants
  -- somebody rejects them, which is honest; marking them withdrawn would put
  -- words in their mouth.
  if p_status = 'withdrawn' then
    raise exception 'only the applicant can withdraw' using errcode = '22023';
  end if;

  -- The status trigger notifies the applicant. This function's job is to
  -- decide whether the move is allowed at all.
  update public.job_applications
     set status = p_status, updated_at = now()
   where id = a.id;
end;
$$;

grant execute on function
  public.job_set_application_status(uuid, public.application_status)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Withdrawing
-- ---------------------------------------------------------------------------
--
-- The applicant's own row, so RLS would allow the update on its own. It is a
-- function so that withdrawing also stamps `withdrawn_at` and cannot be
-- confused with an employer rejecting somebody, which is a different sentence
-- in the applicant's list.

create or replace function public.job_withdraw_application(p_application uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  a public.job_applications%rowtype;
begin
  if uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into a from public.job_applications where id = p_application;
  if not found or a.applicant_id <> uid then
    raise exception 'application not found' using errcode = 'P0002';
  end if;

  -- The status trigger sees `withdrawn` and tells the employer. Before this
  -- file it told the applicant that they had withdrawn, which is why the
  -- trigger is replaced above rather than worked around here.
  update public.job_applications
     set status = 'withdrawn', withdrawn_at = now(), updated_at = now()
   where id = a.id;
end;
$$;

grant execute on function public.job_withdraw_application(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Interviews
-- ---------------------------------------------------------------------------

create or replace function public.job_schedule_interview(
  p_application uuid,
  p_scheduled_at timestamptz default null,
  p_mode text default null,
  p_location text default null,
  p_note text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  a public.job_applications%rowtype;
  j public.jobs%rowtype;
  interview_id uuid;
  moved integer;
begin
  if uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into a from public.job_applications where id = p_application;
  if not found then
    raise exception 'application not found' using errcode = 'P0002';
  end if;

  select * into j from public.jobs where id = a.job_id;
  if j.poster_id <> uid then
    raise exception 'application not found' using errcode = 'P0002';
  end if;

  insert into public.job_interviews (
    application_id, job_id, scheduled_at, mode, location, note, created_by
  )
  values (a.id, j.id, p_scheduled_at, p_mode, p_location, p_note, uid)
  returning id into interview_id;

  -- An interview invitation moves the application. Leaving the status behind
  -- would show an employer "shortlisted" for somebody they have already
  -- arranged to meet.
  update public.job_applications
     set status = 'interviewing', updated_at = now()
   where id = a.id
     and status not in ('interviewing', 'hired', 'rejected', 'withdrawn');

  get diagnostics moved = row_count;

  -- When the status moved, the trigger has already said "you have been invited
  -- to interview" and saying it again would be two of the same message. When
  -- it did not move — a second interview, or a reschedule — nothing has been
  -- said yet, and silence is worse.
  if moved = 0 then
    insert into public.notifications (user_id, actor_id, kind, title, body, href)
    values (
      a.applicant_id,
      uid,
      'application_update',
      'Your interview has been updated',
      j.title,
      '/jobs/' || j.id
    );
  end if;

  return interview_id;
end;
$$;

grant execute on function
  public.job_schedule_interview(uuid, timestamptz, text, text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Hiring
-- ---------------------------------------------------------------------------
--
-- The one operation that creates something rather than moving it. It records
-- the agreement, fills an opening and opens the conversation the two of them
-- will work through — all in one transaction, because a hire with no
-- conversation is a hire nobody can act on.
--
-- The notification comes from the status trigger, which sees the application
-- become `hired` and sends `job_hired`. That is the whole reason the status is
-- set here rather than left to the caller.

create or replace function public.job_hire(
  p_application uuid,
  p_amount numeric default null,
  p_currency text default null,
  p_period text default null,
  p_starts_on date default null,
  p_note text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  a public.job_applications%rowtype;
  j public.jobs%rowtype;
  hire_id uuid;
  thread uuid;
begin
  if uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into a from public.job_applications where id = p_application;
  if not found then
    raise exception 'application not found' using errcode = 'P0002';
  end if;

  select * into j from public.jobs where id = a.job_id;
  if j.poster_id <> uid then
    raise exception 'application not found' using errcode = 'P0002';
  end if;

  if a.status = 'withdrawn' then
    raise exception 'this application was withdrawn' using errcode = '22023';
  end if;

  insert into public.job_hires (
    job_id, application_id, employer_id, professional_id, company_id,
    agreed_amount, currency, amount_period, starts_on, note
  )
  values (
    j.id, a.id, uid, a.applicant_id, j.company_id,
    coalesce(p_amount, a.expected_salary),
    coalesce(nullif(trim(p_currency), ''), j.currency),
    coalesce(nullif(trim(p_period), ''), j.salary_period),
    p_starts_on,
    p_note
  )
  -- Pressing Hire twice is one agreement, not two.
  on conflict (application_id) do nothing
  returning id into hire_id;

  if hire_id is null then
    select id into hire_id from public.job_hires where application_id = a.id;
    return hire_id;
  end if;

  update public.job_applications
     set status = 'hired', updated_at = now()
   where id = a.id;

  -- One opening filled per hire. A job for three people stays open until three
  -- have been hired, which is what `openings` is for.
  update public.jobs
     set status = case
           when (select count(*) from public.job_hires h where h.job_id = j.id)
                >= j.openings then 'filled'
           else status
         end,
         updated_at = now()
   where id = j.id;

  -- The conversation they will actually work through. `start_direct_conversation`
  -- returns the existing thread when there is one, so hiring somebody you have
  -- already been talking to continues that conversation rather than opening a
  -- second one beside it.
  begin
    thread := public.start_direct_conversation(
      a.applicant_id, 'job', j.id, j.title
    );
    update public.job_hires set conversation_id = thread where id = hire_id;
  exception when others then
    -- A hire is the record that matters. If the thread cannot be opened the
    -- hire still stands and either side can message from the job page.
    null;
  end;

  -- "You have been hired" was already sent by the status trigger, above.

  return hire_id;
end;
$$;

grant execute on function
  public.job_hire(uuid, numeric, text, text, date, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Saving
-- ---------------------------------------------------------------------------
--
-- Not security definer: saving touches nobody but the person doing it, and the
-- policy on `job_saved` is the whole rule. It is a function only so the button
-- has one call to make instead of a read, a branch and a write.

create or replace function public.job_toggle_saved(p_job uuid)
returns boolean
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  removed integer;
begin
  if uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  delete from public.job_saved where user_id = uid and job_id = p_job;
  get diagnostics removed = row_count;

  if removed > 0 then
    return false;
  end if;

  insert into public.job_saved (user_id, job_id) values (uid, p_job)
  on conflict do nothing;
  return true;
end;
$$;

grant execute on function public.job_toggle_saved(uuid) to authenticated;

commit;
