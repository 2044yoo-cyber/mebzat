-- Phase 4: The project marketplace.
--
-- Clients publish a brief; professionals bid; the client compares the bids
-- side by side and hires. Additive only.
--
-- This is deliberately a different table from `projects` (0004). A project is
-- finished work in a portfolio; a brief is work someone wants doing. They have
-- almost no columns in common, and merging them would put a status flag on
-- every portfolio query forever.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.brief_status as enum (
  'draft',
  'open',
  'reviewing',
  'awarded',
  'in_progress',
  'completed',
  'cancelled'
);

create type public.brief_bid_status as enum (
  'submitted',
  'shortlisted',
  'accepted',
  'declined',
  'withdrawn'
);

-- How the client wants the work packaged, which decides what a bid must cover.
create type public.contract_shape as enum (
  'labour_only',
  'material_supplied_by_client',
  'supply_and_fit',
  'full_contract'
);

create type public.budget_kind as enum ('fixed', 'range', 'open');

-- ---------------------------------------------------------------------------
-- project_briefs
-- ---------------------------------------------------------------------------

create table public.project_briefs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,

  title text not null,
  slug text not null,
  description text not null,

  category text not null,
  subcategory text,
  -- Which service categories should be told about this. Held as slugs rather
  -- than ids so the matcher does not need a join table per brief.
  required_skills text[] not null default '{}',

  contract_shape public.contract_shape not null default 'supply_and_fit',
  budget_kind public.budget_kind not null default 'range',
  budget_min numeric(14, 2) check (budget_min >= 0),
  budget_max numeric(14, 2) check (budget_max >= 0),
  currency text not null default 'ETB',

  location_city text,
  location_country text not null default 'Ethiopia',
  latitude double precision,
  longitude double precision,

  starts_on date,
  deadline_on date,
  bids_close_on date,

  -- Kept in step by trigger so the browse list can sort on them.
  bid_count integer not null default 0,
  lowest_bid numeric(14, 2),
  highest_bid numeric(14, 2),
  average_bid numeric(14, 2),
  view_count integer not null default 0,

  awarded_bid_id uuid,
  status public.brief_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint briefs_budget_range check (
    budget_max is null or budget_min is null or budget_max >= budget_min
  ),
  constraint briefs_dates_ordered check (
    deadline_on is null or starts_on is null or deadline_on >= starts_on
  ),
  constraint briefs_slug_unique unique (client_id, slug)
);

comment on table public.project_briefs is
  'Work a client wants done. Distinct from projects, which are finished work.';

create index briefs_open_idx
  on public.project_briefs (created_at desc)
  where status = 'open';
create index briefs_category_idx on public.project_briefs (category, created_at desc);
create index briefs_city_idx on public.project_briefs (location_city);
create index briefs_client_idx on public.project_briefs (client_id, created_at desc);
create index briefs_budget_idx on public.project_briefs (budget_max)
  where status = 'open';
-- The matcher looks up briefs by skill, which needs the array indexed.
create index briefs_skills_idx on public.project_briefs using gin (required_skills);

create index briefs_search_idx
  on public.project_briefs
  using gin (
    to_tsvector(
      'simple',
      coalesce(title, '') || ' ' || coalesce(description, '') || ' ' ||
      coalesce(category, '')
    )
  );

create trigger project_briefs_set_updated_at
  before update on public.project_briefs
  for each row
  execute function public.set_updated_at();

create table public.brief_attachments (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references public.project_briefs (id) on delete cascade,
  url text not null,
  -- 'image', 'video' or 'drawing'. A drawing is shown with a download rather
  -- than an inline preview, because a DWG has nothing to preview.
  kind text not null default 'image',
  file_name text,
  position smallint not null default 0,
  created_at timestamptz not null default now()
);

create index brief_attachments_brief_idx
  on public.brief_attachments (brief_id, position);

-- ---------------------------------------------------------------------------
-- brief_bids
-- Everything the comparison table needs, so comparing is one read rather than
-- a join per column.
-- ---------------------------------------------------------------------------

create table public.brief_bids (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references public.project_briefs (id) on delete cascade,
  bidder_id uuid not null references public.profiles (id) on delete cascade,
  company_id uuid references public.companies (id) on delete set null,
  -- Which of the bidder's services this bid is offered under, so a win can be
  -- attributed to the right one in that service's analytics.
  service_id uuid references public.services (id) on delete set null,

  price numeric(14, 2) not null check (price >= 0),
  currency text not null default 'ETB',
  price_note text,

  timeline_days integer check (timeline_days >= 0),
  can_start_on date,
  team_size smallint check (team_size >= 1),

  proposal text not null,
  warranty_months smallint check (warranty_months >= 0),
  material_included boolean not null default true,
  labour_included boolean not null default true,

  status public.brief_bid_status not null default 'submitted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One live bid per bidder per brief; improving an offer updates it.
  constraint brief_bids_one_per_bidder unique (brief_id, bidder_id)
);

create index brief_bids_brief_idx on public.brief_bids (brief_id, price);
create index brief_bids_bidder_idx
  on public.brief_bids (bidder_id, created_at desc);

create trigger brief_bids_set_updated_at
  before update on public.brief_bids
  for each row
  execute function public.set_updated_at();

alter table public.project_briefs
  add constraint briefs_awarded_bid_fk
  foreign key (awarded_bid_id)
  references public.brief_bids (id) on delete set null;

-- ---------------------------------------------------------------------------
-- brief_invites
-- Who was told about a brief, by the matcher or by the client directly.
-- Recorded so the same professional is not notified twice.
-- ---------------------------------------------------------------------------

create table public.brief_invites (
  brief_id uuid not null references public.project_briefs (id) on delete cascade,
  professional_id uuid not null references public.profiles (id) on delete cascade,
  service_id uuid references public.services (id) on delete set null,
  -- 0..1, from match_professionals(). Kept so a client can see why someone
  -- was suggested.
  score real,
  invited_by_client boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (brief_id, professional_id)
);

create index brief_invites_professional_idx
  on public.brief_invites (professional_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.project_briefs enable row level security;
alter table public.brief_attachments enable row level security;
alter table public.brief_bids enable row level security;
alter table public.brief_invites enable row level security;

create policy "Open briefs are viewable by everyone"
  on public.project_briefs for select
  to authenticated, anon
  using (status <> 'draft' or client_id = auth.uid());

create policy "Clients manage their own briefs"
  on public.project_briefs for all
  to authenticated
  using (client_id = auth.uid())
  with check (client_id = auth.uid());

create policy "Attachments follow their brief"
  on public.brief_attachments for select
  to authenticated, anon
  using (
    exists (
      select 1 from public.project_briefs b
      where b.id = brief_attachments.brief_id
        and (b.status <> 'draft' or b.client_id = auth.uid())
    )
  );

create policy "Clients manage their brief attachments"
  on public.brief_attachments for all
  to authenticated
  using (
    exists (
      select 1 from public.project_briefs b
      where b.id = brief_attachments.brief_id and b.client_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.project_briefs b
      where b.id = brief_attachments.brief_id and b.client_id = auth.uid()
    )
  );

-- A bid is commercially sensitive: the client sees every bid, a bidder sees
-- only their own. Publishing them all would turn the marketplace into a race
-- to undercut whoever bid last.
create policy "Bids are visible to the client and the bidder"
  on public.brief_bids for select
  to authenticated
  using (
    bidder_id = auth.uid()
    or exists (
      select 1 from public.project_briefs b
      where b.id = brief_bids.brief_id and b.client_id = auth.uid()
    )
  );

create policy "Professionals submit their own bids"
  on public.brief_bids for insert
  to authenticated
  with check (bidder_id = auth.uid());

create policy "Bidders update their own bids"
  on public.brief_bids for update
  to authenticated
  using (bidder_id = auth.uid())
  with check (bidder_id = auth.uid());

-- The client shortlists, accepts or declines, which is also an update.
create policy "Clients decide on bids"
  on public.brief_bids for update
  to authenticated
  using (
    exists (
      select 1 from public.project_briefs b
      where b.id = brief_bids.brief_id and b.client_id = auth.uid()
    )
  );

create policy "Invites are visible to the client and the invitee"
  on public.brief_invites for select
  to authenticated
  using (
    professional_id = auth.uid()
    or exists (
      select 1 from public.project_briefs b
      where b.id = brief_invites.brief_id and b.client_id = auth.uid()
    )
  );

create policy "Clients invite to their own briefs"
  on public.brief_invites for insert
  to authenticated
  with check (
    exists (
      select 1 from public.project_briefs b
      where b.id = brief_invites.brief_id and b.client_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Bid aggregates
-- ---------------------------------------------------------------------------

create function public.refresh_brief_bids()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.brief_id, old.brief_id);
begin
  update public.project_briefs b
  set bid_count = agg.count,
      lowest_bid = agg.low,
      highest_bid = agg.high,
      average_bid = agg.mean
  from (
    select
      count(*)::integer as count,
      min(price) as low,
      max(price) as high,
      round(avg(price), 2) as mean
    from public.brief_bids
    where brief_id = target
      and status in ('submitted', 'shortlisted', 'accepted')
  ) agg
  where b.id = target;

  return coalesce(new, old);
end;
$$;

create trigger brief_bids_refresh
  after insert or update or delete on public.brief_bids
  for each row
  execute function public.refresh_brief_bids();

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------

create function public.notify_brief_bid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  brief public.project_briefs;
  actor text;
begin
  select * into brief from public.project_briefs where id = new.brief_id;
  if brief.client_id = new.bidder_id then
    return new;
  end if;

  select coalesce(full_name, company_name, username, 'Someone')
  into actor from public.profiles where id = new.bidder_id;

  insert into public.notifications (user_id, actor_id, kind, title, body, href)
  values (
    brief.client_id,
    new.bidder_id,
    'quote_received',
    actor || ' bid on ' || brief.title,
    new.currency || ' ' || new.price ||
      coalesce(' · ' || new.timeline_days || ' days', ''),
    '/hire/' || brief.id
  );

  -- The bid also counts towards the service it was offered under.
  if new.service_id is not null then
    insert into public.service_events (service_id, actor_id, kind, value, currency)
    values (new.service_id, new.bidder_id, 'bid_submitted', new.price, new.currency);
  end if;

  return new;
end;
$$;

create trigger brief_bids_notify
  after insert on public.brief_bids
  for each row
  execute function public.notify_brief_bid();

/** Tells a bidder when their bid moves, and only on an actual change. */
create function public.notify_bid_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  brief public.project_briefs;
begin
  if new.status = old.status then
    return new;
  end if;

  select * into brief from public.project_briefs where id = new.brief_id;

  insert into public.notifications (user_id, kind, title, body, href)
  values (
    new.bidder_id,
    'quote_request',
    'Your bid on ' || brief.title || ' is now ' || new.status,
    null,
    '/hire/' || brief.id
  );

  if new.status = 'accepted' and new.service_id is not null then
    insert into public.service_events (service_id, actor_id, kind, value, currency)
    values (new.service_id, new.bidder_id, 'bid_accepted', new.price, new.currency);
  end if;

  return new;
end;
$$;

create trigger brief_bids_decision_notify
  after update on public.brief_bids
  for each row
  execute function public.notify_bid_decision();

-- ---------------------------------------------------------------------------
-- Smart matching
-- Scores a professional's services against a brief on the things a client
-- would weigh themselves: does it match the work, can they afford it, are
-- they nearby, are they free, are they any good.
-- ---------------------------------------------------------------------------

/** Great-circle distance in km. Used to rank by proximity, not to navigate. */
create function public.distance_km(
  lat1 double precision,
  lon1 double precision,
  lat2 double precision,
  lon2 double precision
)
returns double precision
language sql
immutable
as $$
  select case
    when lat1 is null or lon1 is null or lat2 is null or lon2 is null then null
    else 6371 * acos(
      least(1, greatest(-1,
        cos(radians(lat1)) * cos(radians(lat2)) *
        cos(radians(lon2) - radians(lon1)) +
        sin(radians(lat1)) * sin(radians(lat2))
      ))
    )
  end;
$$;

/**
 * Ranks services against a brief.
 *
 * The weights are deliberately visible rather than learned: a client asking
 * "why was this one first" deserves an answer, and a marketplace that cannot
 * explain its own ranking is one nobody trusts.
 *
 *   category / skills   0.35   is this even the right trade
 *   budget fit          0.20   can they work within the money
 *   location            0.15   same city, or within their stated radius
 *   availability        0.15   can they start
 *   rating and history  0.15   are they any good at it
 */
create function public.match_professionals(
  target_brief_id uuid,
  max_results integer default 20
)
returns table (
  service_id uuid,
  provider_id uuid,
  title text,
  score real,
  reason text
)
language sql
stable
security definer
set search_path = public
as $$
  with brief as (
    select * from public.project_briefs where id = target_brief_id
  ),
  scored as (
    select
      s.id,
      s.provider_id,
      s.title,

      -- Trade match: the category outright, or one of the required skills.
      (case
        when lower(sc.slug) = lower(b.category) then 0.35
        when sc.slug = any (b.required_skills) then 0.30
        when b.category ilike '%' || sc.name || '%'
          or s.title ilike '%' || b.category || '%' then 0.22
        else 0
      end)::real as trade,

      -- Budget fit: their starting price sits inside what the client said.
      (case
        when b.budget_max is null or s.price_from is null then 0.10
        when s.price_from <= b.budget_max then 0.20
        when s.price_from <= b.budget_max * 1.2 then 0.08
        else 0
      end)::real as budget,

      -- Location: same city, or inside the radius they said they travel.
      (case
        when b.location_city is null or s.location_city is null then 0.05
        when s.location_city = b.location_city then 0.15
        when s.serves_remotely then 0.12
        when s.service_radius_km is not null
          and public.distance_km(b.latitude, b.longitude, p.latitude, p.longitude)
              <= s.service_radius_km then 0.11
        else 0
      end)::real as locality,

      -- Availability, from the live work status.
      (case s.work_status
        when 'available' then 0.15
        when 'limited' then 0.10
        when 'busy' then 0.04
        else 0
      end)::real as availability,

      -- Track record. Rating carries most of it; volume breaks ties.
      (least(s.rating / 5.0, 1) * 0.10
        + least(s.completed_projects / 20.0, 1) * 0.05)::real as track_record,

      sc.name as category_name
    from brief b
    cross join lateral (
      select s.*
      from public.services s
      where s.status = 'published'
        and s.accepting_work
        and s.provider_id <> b.client_id
    ) s
    left join public.service_categories sc on sc.id = s.category_id
    left join public.profiles p on p.id = s.provider_id
  )
  select
    id,
    provider_id,
    title,
    (trade + budget + locality + availability + track_record)::real as score,
    -- A short, honest explanation of the top contributing factor.
    case
      when trade >= 0.30 then 'Specialises in ' || coalesce(category_name, 'this work')
      when budget >= 0.20 then 'Works within your budget'
      when locality >= 0.15 then 'Based in your city'
      when availability >= 0.15 then 'Available to start now'
      else 'Related experience'
    end
  from scored
  -- Below a third of the maximum it is not a match, it is filler.
  where (trade + budget + locality + availability + track_record) >= 0.33
  order by score desc
  limit max_results;
$$;

/**
 * Notifies the professionals a brief matches, once each.
 *
 * Called after the brief is published rather than by trigger on insert: a
 * draft should not wake anybody, and the client may still be editing.
 */
create function public.invite_matching_professionals(
  target_brief_id uuid,
  max_invites integer default 15
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  brief public.project_briefs;
  match record;
  sent integer := 0;
begin
  select * into brief from public.project_briefs where id = target_brief_id;
  if brief is null or brief.status <> 'open' then
    return 0;
  end if;

  for match in
    select * from public.match_professionals(target_brief_id, max_invites)
  loop
    -- The primary key makes a repeat call a no-op, so re-publishing a brief
    -- does not notify the same people again.
    insert into public.brief_invites (brief_id, professional_id, service_id, score)
    values (target_brief_id, match.provider_id, match.service_id, match.score)
    on conflict (brief_id, professional_id) do nothing;

    if found then
      insert into public.notifications (user_id, kind, title, body, href)
      values (
        match.provider_id,
        'quote_request',
        'New project matches your services: ' || brief.title,
        match.reason,
        '/hire/' || brief.id
      );
      sent := sent + 1;
    end if;
  end loop;

  return sent;
end;
$$;

create function public.increment_brief_views(target_brief_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.project_briefs
  set view_count = view_count + 1
  where id = target_brief_id;
$$;

grant execute on function public.distance_km(double precision, double precision, double precision, double precision) to anon, authenticated;
grant execute on function public.match_professionals(uuid, integer) to authenticated;
grant execute on function public.invite_matching_professionals(uuid, integer) to authenticated;
grant execute on function public.increment_brief_views(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.brief_bids;
    alter publication supabase_realtime add table public.project_briefs;
  end if;
end
$$;
