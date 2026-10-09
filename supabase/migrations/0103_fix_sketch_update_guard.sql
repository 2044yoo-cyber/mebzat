-- Keep the plan revision check scoped to plan rows. PostgreSQL can resolve
-- NEW.revision while planning a compound boolean expression, even when
-- TG_TABLE_NAME is agenda_sketches and that record has no revision field.
create or replace function public.agenda_plan_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.project_id <> old.project_id then
    raise exception 'A plan cannot be moved to another project.' using errcode = 'check_violation';
  end if;
  if tg_table_name = 'agenda_plans' then
    if new.revision <> old.revision + 1 then
      raise exception 'This plan was changed by somebody else. Reload it first.'
        using errcode = 'serialization_failure';
    end if;
  end if;
  return new;
end;
$$;
