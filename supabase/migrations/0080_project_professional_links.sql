-- A finished project is somebody's work, and the point of showing it is that
-- the person who did it can be hired to do it again.
--
-- The link was already there — `projects.owner_id` — and the page used it for
-- a small avatar card that said "View profile". What it did not say was what
-- the person does, whether anybody has rated them, or how to get a price out
-- of them. Somebody looking at a kitchen they like had to work out for
-- themselves that the name under it was for hire.
--
-- Nothing new is stored for that. What is stored is the other link section 16
-- asks for and 0004 had no column for: the company a project was built by,
-- which is a different fact from the person who published it — a site
-- engineer's portfolio piece belongs to them *and* to the contractor.

alter table public.projects
  add column if not exists company_id uuid
    references public.companies (id) on delete set null;

comment on column public.projects.company_id is
  'The business this work was done under, when there is one. Optional: most projects are somebody personal portfolio and have none.';

create index if not exists projects_company_idx on public.projects (company_id)
  where company_id is not null;

-- ---------------------------------------------------------------------------
-- Who may claim a project for a company
-- ---------------------------------------------------------------------------

-- 0004's update policy is `auth.uid() = owner_id`, which says who may edit the
-- row and says nothing about which company they may name on it. Without this,
-- anybody could attach their project to any business in the directory and have
-- it appear as that business's work.
--
-- A trigger rather than a check constraint: the rule is about the *actor*, and
-- a check constraint cannot see who is making the change.
create or replace function public.enforce_project_company_claim()
returns trigger
language plpgsql
-- `security invoker`, deliberately, for the reason 0064 and 0068 both give:
-- as a definer this runs as its owner, `current_user` could never be an API
-- role, and the guard would read as protection while permitting everything.
security invoker
set search_path = public
as $$
begin
  if new.company_id is null then
    return new;
  end if;

  if current_user in ('authenticated', 'anon') then
    if not exists (
      select 1 from public.companies c
      where c.id = new.company_id
        and (
          c.owner_id = auth.uid()
          or exists (
            -- `status = 'active'`, not merely a row. An invitation that was
            -- sent and never accepted, or a membership somebody was suspended
            -- from, is not permission to publish work in the company's name.
            select 1 from public.company_members m
            where m.company_id = c.id
              and m.user_id = auth.uid()
              and m.status = 'active'
          )
        )
    ) then
      raise exception 'You can only attach a project to a company you belong to'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists projects_company_claim on public.projects;
create trigger projects_company_claim
  before insert or update of company_id on public.projects
  for each row
  execute function public.enforce_project_company_claim();
