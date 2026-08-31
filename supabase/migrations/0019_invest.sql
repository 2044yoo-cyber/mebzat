-- ---------------------------------------------------------------------------
-- 0019 — Medosha Invest
--
-- Development projects raising capital, the people backing them, and the
-- reporting that makes a project legible to someone deciding.
--
-- Everything seeded here is DEMONSTRATION DATA. `is_demo` defaults to true and
-- the seeded rows set it explicitly, because a figure like "45% expected ROI"
-- on a page that does not say plainly it is illustrative is the kind of thing
-- that gets a platform into trouble. The column is what the UI reads to show
-- the badge; it is not decoration.
--
-- Nothing here moves money. There are no balances, no transactions and no
-- payment references, and `invest_positions` records an interest in a demo
-- project rather than a holding of anything.
--
-- NOTE: this file adds values to two existing enums. Postgres will not let a
-- new enum label be *used* in the transaction that adds it, so the function
-- that reads them lives in 0020_invest_search.sql. Run 0019 first, then 0020.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'invest_risk') then
    create type public.invest_risk as enum ('low', 'moderate', 'high');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'invest_stage') then
    create type public.invest_stage as enum (
      'raising',      -- open to interest
      'funded',       -- target reached, building
      'building',     -- under construction
      'completed'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'invest_doc_kind') then
    create type public.invest_doc_kind as enum (
      'prospectus',
      'feasibility',
      'permit',
      'title',
      'financials',
      'progress_report',
      'valuation'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'invest_media_kind') then
    create type public.invest_media_kind as enum (
      'photo',
      'render',
      'drone',
      'video',
      'floor_plan',
      'model_3d'
    );
  end if;
end
$$;

-- New labels on existing enums. Used from 0020, never from this file.
alter type public.search_kind add value if not exists 'investment';
alter type public.notification_kind add value if not exists 'investment_update';

-- ---------------------------------------------------------------------------
-- invest_projects
-- ---------------------------------------------------------------------------

create table if not exists public.invest_projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  summary text,
  description text,

  -- Where. Kept as plain columns rather than a join to properties: an
  -- investment project is a development, not a listing, and may exist before
  -- any property record does.
  location text not null,
  city text not null default 'Addis Ababa',
  latitude double precision,
  longitude double precision,

  -- The money. Stored in minor-unit-free ETB because Ethiopian construction is
  -- quoted in whole birr and cents would be noise at this scale.
  currency text not null default 'ETB',
  funding_goal numeric(16, 2) not null check (funding_goal > 0),
  funding_raised numeric(16, 2) not null default 0 check (funding_raised >= 0),

  expected_roi_pct numeric(5, 2) check (expected_roi_pct >= 0 and expected_roi_pct <= 500),
  duration_months integer check (duration_months > 0 and duration_months <= 240),
  construction_pct numeric(5, 2) not null default 0
    check (construction_pct >= 0 and construction_pct <= 100),

  risk_level public.invest_risk not null default 'moderate',
  stage public.invest_stage not null default 'raising',

  -- The people accountable for it, by name. Linked to real records where one
  -- exists, so the project page can cross-link into companies and profiles.
  developer_name text,
  developer_company_id uuid references public.companies (id) on delete set null,
  developer_rating numeric(3, 2) check (developer_rating >= 0 and developer_rating <= 5),
  architect_name text,
  architect_profile_id uuid references public.profiles (id) on delete set null,
  contractor_name text,
  contractor_company_id uuid references public.companies (id) on delete set null,

  hero_image_url text,
  property_type text,
  started_on date,
  estimated_completion date,

  investor_count integer not null default 0 check (investor_count >= 0),
  follower_count integer not null default 0 check (follower_count >= 0),

  -- The flag the whole module's honesty rests on.
  is_demo boolean not null default true,
  published boolean not null default true,

  owner_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.invest_projects.is_demo is
  'True for illustrative sample projects. The UI must show a DEMO PROJECT badge and must not present the row as a real opportunity.';

create index if not exists invest_projects_stage_idx
  on public.invest_projects (stage, created_at desc);
create index if not exists invest_projects_city_idx
  on public.invest_projects (city);
create index if not exists invest_projects_search_idx
  on public.invest_projects using gin (to_tsvector('simple', title || ' ' || location));

-- Percentage funded, computed rather than stored, so it can never disagree
-- with the two numbers it comes from.
create or replace function public.invest_funding_pct(project public.invest_projects)
returns numeric
language sql
immutable
as $$
  select case
    when project.funding_goal = 0 then 0
    else least(100, round((project.funding_raised / project.funding_goal) * 100, 1))
  end;
$$;

-- ---------------------------------------------------------------------------
-- Updates, documents, media
-- ---------------------------------------------------------------------------

create table if not exists public.invest_project_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.invest_projects (id) on delete cascade,
  title text not null,
  body text,
  construction_pct numeric(5, 2) check (construction_pct >= 0 and construction_pct <= 100),
  published_on date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists invest_updates_project_idx
  on public.invest_project_updates (project_id, published_on desc);

create table if not exists public.invest_project_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.invest_projects (id) on delete cascade,
  kind public.invest_doc_kind not null,
  title text not null,
  url text,
  -- False for a document the project says it has but has not uploaded. Listing
  -- it greyed is honest; pretending the link works is not.
  available boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists invest_documents_project_idx
  on public.invest_project_documents (project_id);

create table if not exists public.invest_project_media (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.invest_projects (id) on delete cascade,
  kind public.invest_media_kind not null,
  url text not null,
  caption text,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists invest_media_project_idx
  on public.invest_project_media (project_id, position);

-- ---------------------------------------------------------------------------
-- Investors
--
-- A member becomes an investor by having a row here. Demo investors carry no
-- profile_id, which is also how the UI knows not to link them anywhere.
-- ---------------------------------------------------------------------------

create table if not exists public.invest_investors (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles (id) on delete cascade,
  display_name text not null,
  city text,
  avatar_url text,
  verified boolean not null default false,
  investor_since date not null default current_date,
  portfolio_value numeric(16, 2) not null default 0 check (portfolio_value >= 0),
  projects_invested integer not null default 0 check (projects_invested >= 0),
  interests text[] not null default '{}',
  is_demo boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists invest_investors_portfolio_idx
  on public.invest_investors (portfolio_value desc);

-- ---------------------------------------------------------------------------
-- Positions and follows
--
-- A position records that an investor is associated with a project. In demo
-- data it is illustrative; there is no ledger, no balance and no settlement.
-- ---------------------------------------------------------------------------

create table if not exists public.invest_positions (
  id uuid primary key default gen_random_uuid(),
  investor_id uuid not null references public.invest_investors (id) on delete cascade,
  project_id uuid not null references public.invest_projects (id) on delete cascade,
  amount numeric(16, 2) not null default 0 check (amount >= 0),
  committed_on date not null default current_date,
  is_demo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (investor_id, project_id)
);

create index if not exists invest_positions_project_idx
  on public.invest_positions (project_id);

create table if not exists public.invest_follows (
  project_id uuid not null references public.invest_projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

-- Follower counts are denormalised for the card grid and recomputed by trigger
-- rather than incremented, so they cannot drift.
create or replace function public.refresh_invest_followers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.project_id, old.project_id);
begin
  update public.invest_projects
     set follower_count = (
           select count(*) from public.invest_follows where project_id = target
         )
   where id = target;
  return null;
end;
$$;

drop trigger if exists invest_follows_count on public.invest_follows;
create trigger invest_follows_count
after insert or delete on public.invest_follows
for each row execute function public.refresh_invest_followers();

-- ---------------------------------------------------------------------------
-- Row level security
--
-- Projects, updates, documents and media are public reading: the whole point
-- is a shop window. Writing is the owner's, and follows are the follower's.
-- ---------------------------------------------------------------------------

alter table public.invest_projects enable row level security;
alter table public.invest_project_updates enable row level security;
alter table public.invest_project_documents enable row level security;
alter table public.invest_project_media enable row level security;
alter table public.invest_investors enable row level security;
alter table public.invest_positions enable row level security;
alter table public.invest_follows enable row level security;

drop policy if exists invest_projects_read on public.invest_projects;
create policy invest_projects_read on public.invest_projects
  for select using (published);

drop policy if exists invest_projects_write on public.invest_projects;
create policy invest_projects_write on public.invest_projects
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists invest_updates_read on public.invest_project_updates;
create policy invest_updates_read on public.invest_project_updates
  for select using (true);

drop policy if exists invest_updates_write on public.invest_project_updates;
create policy invest_updates_write on public.invest_project_updates
  for all using (
    exists (select 1 from public.invest_projects p
             where p.id = project_id and p.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.invest_projects p
             where p.id = project_id and p.owner_id = auth.uid())
  );

drop policy if exists invest_documents_read on public.invest_project_documents;
create policy invest_documents_read on public.invest_project_documents
  for select using (true);

drop policy if exists invest_documents_write on public.invest_project_documents;
create policy invest_documents_write on public.invest_project_documents
  for all using (
    exists (select 1 from public.invest_projects p
             where p.id = project_id and p.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.invest_projects p
             where p.id = project_id and p.owner_id = auth.uid())
  );

drop policy if exists invest_media_read on public.invest_project_media;
create policy invest_media_read on public.invest_project_media
  for select using (true);

drop policy if exists invest_media_write on public.invest_project_media;
create policy invest_media_write on public.invest_project_media
  for all using (
    exists (select 1 from public.invest_projects p
             where p.id = project_id and p.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.invest_projects p
             where p.id = project_id and p.owner_id = auth.uid())
  );

drop policy if exists invest_investors_read on public.invest_investors;
create policy invest_investors_read on public.invest_investors
  for select using (true);

drop policy if exists invest_investors_write on public.invest_investors;
create policy invest_investors_write on public.invest_investors
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- Positions are readable because the demo portfolios are part of the display.
-- A real position would be scoped to its owner; nothing here creates one.
drop policy if exists invest_positions_read on public.invest_positions;
create policy invest_positions_read on public.invest_positions
  for select using (
    is_demo
    or exists (select 1 from public.invest_investors i
                where i.id = investor_id and i.profile_id = auth.uid())
  );

drop policy if exists invest_follows_read on public.invest_follows;
create policy invest_follows_read on public.invest_follows
  for select using (user_id = auth.uid());

drop policy if exists invest_follows_write on public.invest_follows;
create policy invest_follows_write on public.invest_follows
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Demonstration data
--
-- Five sample developments and three sample investors. Every row carries
-- is_demo = true. These illustrate the module; they are not offers.
-- ---------------------------------------------------------------------------

insert into public.invest_projects (
  slug, title, summary, location, city, latitude, longitude,
  funding_goal, funding_raised, expected_roi_pct, duration_months,
  construction_pct, risk_level, stage,
  developer_name, developer_rating, architect_name, contractor_name,
  hero_image_url, property_type, started_on, estimated_completion,
  investor_count, is_demo
) values
  (
    'bole-luxury-apartments',
    'Luxury Apartment',
    'A twelve-storey residential building on a corner plot in Bole, finished to a high specification with covered parking and a rooftop terrace.',
    'Bole', 'Addis Ababa', 8.9950, 38.7870,
    120000000, 120000000, 20.00, 24,
    92, 'low', 'building',
    'Habesha Development PLC', 4.7, 'Selam Architects', 'Rift Valley Construction',
    '/images/projects/residential.svg', 'Apartment', date '2024-03-01', date '2026-03-01',
    148, true
  ),
  (
    'cmc-residential-villas',
    'Residential Villas',
    'Eighteen detached villas on serviced plots in CMC, sold with landscaping and boundary walls complete.',
    'CMC', 'Addis Ababa', 9.0180, 38.8330,
    80000000, 80000000, 21.00, 18,
    100, 'low', 'completed',
    'Adwa Properties', 4.5, 'Yeshi Design Studio', 'Adwa Build',
    '/images/projects/residential.svg', 'Villa', date '2023-09-01', date '2025-03-01',
    96, true
  ),
  (
    'kazanchis-commercial-center',
    'Commercial Center',
    'A mixed retail and office centre in Kazanchis with basement parking, anchored by a supermarket on the ground floor.',
    'Kazanchis', 'Addis Ababa', 9.0130, 38.7690,
    300000000, 300000000, 45.00, 36,
    64, 'high', 'building',
    'Entoto Capital Partners', 4.2, 'Blue Nile Architects', 'Zemen Contractors',
    '/images/projects/commercial.svg', 'Commercial', date '2024-01-15', date '2027-01-15',
    312, true
  ),
  (
    'ayat-mixed-use',
    'Mixed Use Development',
    'Ground-floor retail under six residential floors in Ayat, on a plot with existing road and water connections.',
    'Ayat', 'Addis Ababa', 9.0290, 38.8890,
    150000000, 117000000, 24.00, 30,
    38, 'moderate', 'raising',
    'Ayat Urban Developers', 4.4, 'Meskel Studio', 'Sheba Construction',
    '/images/projects/mixed-use.svg', 'Mixed use', date '2025-02-01', date '2027-08-01',
    187, true
  ),
  (
    'summit-modern-townhouses',
    'Modern Townhouses',
    'Twenty-four three-bedroom townhouses in Summit, arranged around a shared central green.',
    'Summit', 'Addis Ababa', 8.9840, 38.8600,
    95000000, 60800000, 18.00, 20,
    21, 'moderate', 'raising',
    'Summit Homes', 4.6, 'Addis Atelier', 'Summit Build Group',
    '/images/projects/residential.svg', 'Townhouse', date '2025-05-01', date '2027-01-01',
    74, true
  )
on conflict (slug) do nothing;

-- Monthly updates, so the reporting timeline is not empty on first load.
insert into public.invest_project_updates (project_id, title, body, construction_pct, published_on)
select p.id, u.title, u.body, u.pct, u.published_on
from public.invest_projects p
join (values
  ('bole-luxury-apartments', 'Glazing complete on floors 1–10', 'Curtain walling is installed to the tenth floor. Internal partitioning follows on the lower six.', 92, current_date - 14),
  ('bole-luxury-apartments', 'Structure topped out', 'The final slab was poured this month, on schedule. Finishing trades mobilise next.', 78, current_date - 45),
  ('kazanchis-commercial-center', 'Basement and ground slab complete', 'Excavation and the two basement levels are finished. Superstructure starts this quarter.', 64, current_date - 20),
  ('kazanchis-commercial-center', 'Piling finished ahead of schedule', 'All 96 piles are in. Dewatering ran longer than planned but did not affect the critical path.', 41, current_date - 60),
  ('ayat-mixed-use', 'Foundations underway', 'Excavation is complete and foundation pours have begun on the retail block.', 38, current_date - 10),
  ('summit-modern-townhouses', 'Site cleared and set out', 'Plot boundaries are set out and the access road base is laid.', 21, current_date - 7),
  ('cmc-residential-villas', 'Handover complete', 'All eighteen villas have been handed over. The project is closed.', 100, current_date - 90)
) as u(slug, title, body, pct, published_on) on u.slug = p.slug
where not exists (
  select 1 from public.invest_project_updates x
   where x.project_id = p.id and x.title = u.title
);

-- Documents. Marked unavailable, because no file has been uploaded — the list
-- says what a project of this kind carries, not that you can open it.
insert into public.invest_project_documents (project_id, kind, title, available)
select p.id, d.kind::public.invest_doc_kind, d.title, false
from public.invest_projects p
cross join (values
  ('prospectus', 'Project prospectus'),
  ('feasibility', 'Feasibility study'),
  ('permit', 'Building permit'),
  ('title', 'Land title'),
  ('financials', 'Financial projections')
) as d(kind, title)
where p.is_demo
  and not exists (
    select 1 from public.invest_project_documents x
     where x.project_id = p.id and x.title = d.title
  );

-- Sample investors.
insert into public.invest_investors (
  display_name, city, verified, investor_since,
  portfolio_value, projects_invested, interests, is_demo
) values
  ('Investor A', 'Addis Ababa', true, date '2023-06-01', 1000000, 3,
   array['Residential', 'Townhouses'], true),
  ('Investor B', 'Addis Ababa', true, date '2022-02-01', 10000000, 5,
   array['Commercial', 'Mixed use', 'Hospitality'], true),
  ('Investor C', 'Adama', false, date '2024-11-01', 500000, 2,
   array['Residential'], true)
on conflict do nothing;

-- Positions linking the sample investors to the sample projects, so a demo
-- portfolio has something in it.
insert into public.invest_positions (investor_id, project_id, amount, committed_on, is_demo)
select i.id, p.id, v.amount, current_date - v.days_ago, true
from (values
  ('Investor A', 'bole-luxury-apartments', 400000, 300),
  ('Investor A', 'summit-modern-townhouses', 350000, 120),
  ('Investor A', 'ayat-mixed-use', 250000, 60),
  ('Investor B', 'kazanchis-commercial-center', 4000000, 400),
  ('Investor B', 'bole-luxury-apartments', 2500000, 380),
  ('Investor B', 'cmc-residential-villas', 1500000, 500),
  ('Investor B', 'ayat-mixed-use', 1200000, 90),
  ('Investor B', 'summit-modern-townhouses', 800000, 40),
  ('Investor C', 'cmc-residential-villas', 300000, 200),
  ('Investor C', 'summit-modern-townhouses', 200000, 30)
) as v(investor, slug, amount, days_ago)
join public.invest_investors i on i.display_name = v.investor and i.is_demo
join public.invest_projects p on p.slug = v.slug
on conflict (investor_id, project_id) do nothing;

-- ---------------------------------------------------------------------------
-- Aggregates for the homepage widget and the index header
-- ---------------------------------------------------------------------------

create or replace function public.invest_overview()
returns table (
  active_projects bigint,
  total_goal numeric,
  total_raised numeric,
  funding_pct numeric,
  avg_roi numeric,
  total_investors bigint,
  demo_only boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*) filter (where stage <> 'completed')::bigint,
    coalesce(sum(funding_goal), 0),
    coalesce(sum(funding_raised), 0),
    case when coalesce(sum(funding_goal), 0) = 0 then 0
         else round((sum(funding_raised) / sum(funding_goal)) * 100, 1) end,
    coalesce(round(avg(expected_roi_pct), 1), 0),
    coalesce(sum(investor_count), 0)::bigint,
    -- True while every published project is a sample, which is what the badge
    -- on the widget reads.
    bool_and(is_demo)
  from public.invest_projects
  where published;
$$;

grant execute on function public.invest_overview() to anon, authenticated;
grant execute on function public.invest_funding_pct(public.invest_projects) to anon, authenticated;
