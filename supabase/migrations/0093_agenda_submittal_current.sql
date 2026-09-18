-- A submittal's current revision was a column nothing ever wrote.
--
-- 0090 gave drawings, documents and submittals the same shape: the record is
-- the thing, and what has been issued of it is a row per revision with the
-- current one held as a pointer. Drawings got `agenda_drawing_set_current`,
-- documents got `agenda_document_set_current` — and submittals got the column,
-- the foreign key, and no trigger.
--
-- So `agenda_submittals.current_revision_id` has been null on every row since
-- it was created. Nothing reads it yet, which is the only reason it has not
-- been noticed; the submittal register being built now is the first thing that
-- would ask "what is with the consultant" and get null back for an answer.
--
-- Written as a trigger rather than as a second statement in the action, for
-- the same reason the other two are: a revision issued any other way — an
-- import, a fix in the SQL editor, a later module — must still become current.
-- A rule the application remembers is a rule that holds until somebody writes
-- a second application.

begin;

create or replace function public.agenda_submittal_set_current()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.agenda_submittals
  set current_revision_id = new.id, updated_at = now()
  where id = new.submittal_id;
  return new;
end;
$$;

drop trigger if exists agenda_submittal_set_current
  on public.agenda_submittal_revisions;
create trigger agenda_submittal_set_current
  after insert on public.agenda_submittal_revisions
  for each row execute function public.agenda_submittal_set_current();

-- Backfill: the highest revision already issued becomes the current one.
--
-- `distinct on` rather than a correlated subquery — one pass over the
-- revisions, and the ordering is the same one the trigger implies.
update public.agenda_submittals s
set current_revision_id = latest.id
from (
  select distinct on (submittal_id) submittal_id, id
  from public.agenda_submittal_revisions
  order by submittal_id, revision desc
) latest
where latest.submittal_id = s.id
  and s.current_revision_id is distinct from latest.id;

commit;
