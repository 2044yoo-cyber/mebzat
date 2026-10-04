-- What a profession asks that no other profession asks.
--
-- A contractor is asked for crew size, plant, capacity and subcontracting. An
-- architect is asked for none of those and is asked for BIM software and
-- permit-drawing experience instead. An electrician is asked for six things
-- and is finished. Columns for the union of all of it would be seventy mostly
-- null columns on `profiles` and a migration every time somebody names a new
-- trade — which is the reason 0078 chose text for `profession` in the first
-- place, and the same reasoning applies one level down.
--
-- So: one jsonb column, keyed by field id, with the shape defined in
-- TypeScript where the form that renders it lives.
--
-- ## Nothing in the database validates it, and that is the cost
--
-- The same trade-off `agenda_form_templates.fields` and `projects.metadata`
-- already make here. The application is the only thing standing between this
-- column and a hand-edited row, so it parses rather than trusts, and it writes
-- only the keys the chosen profession's configuration names.
--
-- ## Why this does not block a second profession
--
-- Answers are keyed by field id, not nested under the profession. An architect
-- who later adds interior design keeps every answer they have given and gains
-- the keys the second configuration asks for; nothing has to move. That is the
-- preparation the brief asks for, and it needs no column that nothing writes.

begin;

alter table public.profiles
  add column if not exists profession_details jsonb not null default '{}'::jsonb;

comment on column public.profiles.profession_details is
  'Answers to the fields a profession asks, keyed by field id. Validated by the application against that profession''s configuration; the database has no opinion about its shape.';

commit;
