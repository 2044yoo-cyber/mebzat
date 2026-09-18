-- RFI-001, SUB-014, PL-035.
--
-- Every record on a construction project has a number people say out loud.
-- "The clash on RFI-023" is how a site meeting refers to a question, and it
-- has to be short, sequential and stable — not a uuid, and not a timestamp.
--
-- ## Why this is a function and not a count
--
-- The obvious implementation is `select count(*) + 1`. It is wrong under
-- concurrency: two engineers raising an RFI in the same second both read the
-- same count and both write RFI-024, and the unique constraint refuses the
-- loser with an error they cannot act on. A sequence per project per kind
-- would be correct and would mean a DDL statement every time somebody starts a
-- project.
--
-- So: a counter table with one row per (project, kind), and an `update ...
-- returning` that increments and reads in the same statement. That takes a row
-- lock rather than a table lock, so two callers serialise on one project's one
-- counter and nobody else waits.
--
-- A reserved number is never reused, including when the insert that asked for
-- it fails. That is deliberate: a gap in the sequence is a record somebody
-- started and abandoned, which is information, and re-issuing numbers means
-- two different documents in two people's inboxes carrying the same one.

begin;

create table if not exists public.agenda_counters (
  project_id uuid not null references public.agenda_projects (id) on delete cascade,
  kind text not null,
  next_value integer not null default 1,
  primary key (project_id, kind)
);

comment on table public.agenda_counters is
  'Next sequential number per project per record kind. Read and incremented in one statement so two people creating at once cannot collide.';

alter table public.agenda_counters enable row level security;

-- No policy grants direct access. The function below is `security definer`
-- and is the only way in: a member has no business reading or writing the
-- counter, only asking it for the next number.

/**
 * The next number for a kind of record on a project, as text.
 *
 * `prefix` is passed rather than looked up so one function serves every module
 * — RFI, SUB, PL, CO, PO — without a table of prefixes that has to be kept in
 * step with the modules using it.
 *
 * Two statements rather than one clever one. The single-statement version
 * needs `xmax` to tell an insert from an update, which is not available in a
 * `returning` clause, and the reader has to know what `xmax` means to check
 * the arithmetic. The `update ... returning` below takes a row lock, so two
 * callers still serialise on it, and what it does is obvious.
 */
create or replace function public.agenda_next_number(
  target_project uuid,
  record_kind text,
  prefix text,
  width integer default 3
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  reserved integer;
begin
  -- Membership is checked here rather than by a policy, because the table has
  -- none: this function is the whole interface to it.
  if not public.agenda_is_member(target_project) then
    raise exception 'You are not on this project.'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.agenda_counters (project_id, kind, next_value)
  values (target_project, record_kind, 1)
  on conflict (project_id, kind) do nothing;

  update public.agenda_counters c
  set next_value = c.next_value + 1
  where c.project_id = target_project and c.kind = record_kind
  returning c.next_value - 1 into reserved;

  return prefix || '-' || lpad(reserved::text, greatest(width, 1), '0');
end;
$$;

revoke all on function public.agenda_next_number(uuid, text, text, integer)
  from public, anon;
grant execute on function public.agenda_next_number(uuid, text, text, integer)
  to authenticated;

commit;
