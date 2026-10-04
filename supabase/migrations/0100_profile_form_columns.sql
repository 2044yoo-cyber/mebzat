-- Every column the profile form writes, whether or not the migration that
-- introduced it ran.
--
-- ## What happened
--
-- Saving a profile in production failed with:
--
--   Could not find the 'company_size' column of 'profiles' in the schema cache
--
-- That sentence is PostgREST's, and it means what it says: the column is not
-- there. It is not a cache that needs clearing and it is not a bug in the
-- form. `company_size` was added by 0086, and 0086 had not been applied.
--
-- ## Why this file exists rather than "apply 0086"
--
-- Because applying 0086 may not be available as an answer. It also creates a
-- storage bucket and its policies, and a migration that fails half way — a
-- bucket that already exists, a policy that does not — leaves the statements
-- after the failure unrun while the ones before it stand. A database can
-- therefore be past 0086 in every visible way and still be missing the four
-- columns at the end of it, which is exactly the state the error describes.
--
-- So this asks for the columns and nothing else. No bucket, no policy, no
-- function, no dependency on any other migration having succeeded. Every
-- statement is `add column if not exists`, so on a database that is fully up
-- to date it changes nothing and reports success.
--
-- ## Why all of them and not just the one that failed
--
-- Fixing `company_size` alone would have been answered by the next save
-- failing on `profession_details`, and that one by `industry`. The form writes
-- twenty-four columns; this names every one of them that was introduced after
-- the table itself, so the next save fails on nothing.
--
-- ## Nothing here removes or rewrites anything
--
-- No drop, no type change, no default applied to an existing column. A column
-- that is already present keeps its data, its type and its constraints — `if
-- not exists` skips it entirely rather than reconciling it.

begin;

-- The four from 0086. `company_size` is the one the error named, and text is
-- what it has always been: the form validates the value against a list of
-- bands in `lib/constants/industries.ts` before writing, so the column holds
-- "1–5 people", not a number.
alter table public.profiles
  add column if not exists company_size text,
  add column if not exists industry text,
  add column if not exists portfolio_link text,
  add column if not exists linkedin_url text;

-- From 0098. `not null default` rather than a bare column: every profession's
-- answers live in here keyed by field id, and code that reads it expects an
-- object rather than a null.
alter table public.profiles
  add column if not exists profession_details jsonb not null default '{}'::jsonb;

-- From 0078. The areas block, which the same form posts on every save.
alter table public.profiles
  add column if not exists specialties text[] not null default '{}'::text[],
  add column if not exists base_area text,
  add column if not exists travel_radius_km integer,
  add column if not exists serves_entire_city boolean not null default false;

-- From 0071 and 0012.
alter table public.profiles
  add column if not exists show_phone boolean not null default false,
  add column if not exists show_email boolean not null default false,
  add column if not exists profession text;

-- `work_status` is an enum, so the type has to exist before the column can.
-- Guarded rather than assumed: `create type` is not `if not exists`-able the
-- way a column is, and a bare `create type` on a database that already has it
-- fails the whole migration.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'work_status') then
    create type public.work_status as enum (
      'available', 'limited', 'busy', 'fully_booked'
    );
  end if;

  execute
    'alter table public.profiles add column if not exists work_status '
    || 'public.work_status not null default ''available''';
end;
$$;

-- A mark of its own.
--
-- Every column above is also added by an earlier migration, which is the whole
-- point — and it means no column can answer "has 0100 run?". A comment can:
-- 0086 comments on `industry` and `portfolio_link` and not on `company_size`,
-- so this one sentence is unique to this file and is what
-- supabase/tests/which-migrations.sql looks for.
comment on column public.profiles.company_size is
  'How many people the organisation employs, as a band rather than a number — the form validates against a list before writing. Re-asserted by 0100, which re-adds every column the profile form writes for databases that stopped part-way through an earlier migration.';

-- PostgREST caches the schema and answers from the cache. A column added
-- underneath it is invisible until it reloads, which is the difference between
-- this migration working and this migration appearing not to. Supabase listens
-- for this notification and reloads on it.
notify pgrst, 'reload schema';

commit;
