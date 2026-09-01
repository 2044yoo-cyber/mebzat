-- A register of rows Medosha put there itself.
--
-- Populating a new marketplace is a real need: a jobs board with four
-- postings on it looks broken, and nobody applies to a board that looks
-- broken. But content the platform placed has to be removable later, exactly
-- and completely, without a person having to remember which rows were which.
--
-- Why a table rather than an `is_seed_data` column on `jobs`:
--
-- Every read of a job in this application is `select *`. A column on `jobs`
-- would therefore be sent to the browser with every job card and every job
-- page — not *displayed*, but present in the payload, readable by anyone who
-- opens the network tab. A separate table is never joined by any query the
-- application makes, so it is genuinely invisible rather than merely unshown.
--
-- It also means the `jobs` table is not altered at all, so nothing that reads
-- or writes a job behaves any differently than it did before this file ran.

begin;

create table if not exists public.seed_content (
  id uuid primary key default gen_random_uuid(),
  /** Which table the row is in. Text, so this outlives any one feature. */
  entity text not null,
  /** The row's primary key. Not a foreign key on purpose — see below. */
  entity_id uuid not null,
  /** Which population run put it there, so runs can be removed separately. */
  batch text not null,
  created_at timestamptz not null default now(),

  constraint seed_content_unique unique (entity, entity_id)
);

comment on table public.seed_content is
  'Rows placed by Medosha to populate a module. Never read by the application.';

create index if not exists seed_content_batch_idx
  on public.seed_content (batch, entity);

-- No foreign key to `jobs`. A cascade would mean deleting a seeded job by hand
-- silently removes its registration, and then a later cleanup reports fewer
-- rows than it removed and nobody can tell whether that is right. The register
-- is a record of what was done, and a record that edits itself is not one.

alter table public.seed_content enable row level security;

-- No policies at all, deliberately.
--
-- With RLS on and no policy, `anon` and `authenticated` see an empty table and
-- can write nothing. The service role and the SQL editor bypass RLS entirely,
-- which is the only place this is ever touched. That is the whole access
-- model, and it is enforced by the absence of a policy rather than by everyone
-- remembering not to query it.

-- ---------------------------------------------------------------------------

/**
 * Removes a batch, and nothing else.
 *
 * Deletes only rows this register names. A job somebody real posted is not in
 * the register, so it cannot be reached from here however the batch is named.
 *
 * Applications, attachments, saves and interviews on a removed job go with it
 * through the foreign keys already on those tables — which is correct: if
 * somebody applied to a posting that is being withdrawn, the application has
 * nothing left to be about.
 */
create or replace function public.remove_seed_content(p_batch text)
returns table (entity text, removed integer)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  jobs_removed integer := 0;
begin
  delete from public.jobs j
   using public.seed_content s
   where s.batch = p_batch
     and s.entity = 'jobs'
     and s.entity_id = j.id;

  get diagnostics jobs_removed = row_count;

  delete from public.seed_content where batch = p_batch;

  return query select 'jobs'::text, jobs_removed;
end;
$$;

-- Executable by nobody by default. `security definer` on a function that
-- deletes rows is only safe while the grant list is empty: the SQL editor and
-- the service role can call it, a signed-in member cannot.
revoke all on function public.remove_seed_content(text) from public;
revoke all on function public.remove_seed_content(text) from anon, authenticated;

commit;
