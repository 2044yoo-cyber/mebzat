-- Phase 4: The service ecosystem.
--
-- One account is never limited to one profession. An interior design studio
-- that also manufactures wardrobes, prepares BOQs and supplies materials
-- publishes each of those as a separate service, and each one behaves like an
-- independent business: its own pricing, capacity, portfolio, certificates,
-- availability and analytics.
--
-- Additive only. `services` already exists from 0011 with the basics; this
-- widens it rather than replacing it, so existing rows and the pages that read
-- them keep working.

-- ---------------------------------------------------------------------------
-- Pricing
-- The spec lists sixteen ways a construction service gets priced. They are an
-- enum rather than free text because the marketplace has to filter, compare
-- and normalise across them — "per m²" and "per square metre" being different
-- strings would quietly split the same market in two.
-- ---------------------------------------------------------------------------

alter type public.service_pricing add value if not exists 'per_running_meter';
alter type public.service_pricing add value if not exists 'per_piece';
alter type public.service_pricing add value if not exists 'per_room';
alter type public.service_pricing add value if not exists 'per_unit';
alter type public.service_pricing add value if not exists 'weekly';
alter type public.service_pricing add value if not exists 'monthly';
alter type public.service_pricing add value if not exists 'per_truck';
alter type public.service_pricing add value if not exists 'per_m3';
alter type public.service_pricing add value if not exists 'per_kg';
alter type public.service_pricing add value if not exists 'per_ton';
alter type public.service_pricing add value if not exists 'custom';
alter type public.service_pricing add value if not exists 'negotiable';

-- ---------------------------------------------------------------------------
-- Work status
-- Live availability, shown on the professional, the company and each service.
-- A client's first question is "can you start", and an answer that is a month
-- stale is worse than no answer.
-- ---------------------------------------------------------------------------

create type public.work_status as enum (
  'available',
  'limited',
  'busy',
  'fully_booked',
  'offline'
);

-- What a service covers, which changes what a quote means.
create type public.service_scope as enum (
  'labour_only',
  'material_only',
  'supply_and_fit',
  'full_contract'
);

-- ---------------------------------------------------------------------------
-- services: the independent-business columns
-- ---------------------------------------------------------------------------

alter table public.services
  add column if not exists subcategory text,
  add column if not exists scope public.service_scope not null default 'supply_and_fit',
  add column if not exists material_included boolean not null default true,
  add column if not exists labour_included boolean not null default true,

  -- Capacity, in the service's own unit. min_order stops a wardrobe maker
  -- being asked to quote for one shelf.
  add column if not exists min_order numeric(14, 2) check (min_order >= 0),
  add column if not exists max_capacity numeric(14, 2) check (max_capacity >= 0),
  add column if not exists capacity_unit text,

  add column if not exists work_status public.work_status not null default 'available',
  add column if not exists next_available_on date,
  add column if not exists completion_days integer check (completion_days >= 0),

  -- How far the provider will travel. Null means they did not say, which
  -- reads differently from zero.
  add column if not exists service_radius_km integer check (service_radius_km >= 0),

  add column if not exists years_experience smallint check (years_experience >= 0),
  add column if not exists completed_projects integer not null default 0,

  -- Median minutes to first reply, maintained from the messaging tables by
  -- refresh_response_time(). Denormalised because it appears on every card.
  add column if not exists response_minutes integer,

  add column if not exists follower_count integer not null default 0,
  add column if not exists bookmark_count integer not null default 0,
  add column if not exists quote_request_count integer not null default 0,

  add column if not exists phone text,
  add column if not exists whatsapp text,
  add column if not exists video_url text;

comment on column public.services.scope is
  'What the price covers: labour only, material only, supply and fit, or a full contract.';

create index if not exists services_work_status_idx
  on public.services (work_status)
  where status = 'published';
create index if not exists services_subcategory_idx
  on public.services (subcategory)
  where subcategory is not null;
create index if not exists services_scope_idx on public.services (scope);

-- ---------------------------------------------------------------------------
-- Work status on the people and companies behind the services
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists work_status public.work_status not null default 'available',
  add column if not exists next_available_on date,
  add column if not exists active_projects integer not null default 0,
  add column if not exists capacity_projects integer,
  add column if not exists response_minutes integer,
  add column if not exists reputation_points integer not null default 0;

alter table public.companies
  add column if not exists work_status public.work_status not null default 'available',
  add column if not exists next_available_on date,
  add column if not exists active_projects integer not null default 0,
  add column if not exists capacity_projects integer,
  add column if not exists response_minutes integer;

create index if not exists profiles_work_status_idx on public.profiles (work_status);
create index if not exists profiles_reputation_idx
  on public.profiles (reputation_points desc);

-- ---------------------------------------------------------------------------
-- service_portfolio
-- Work samples per service, not per account: a studio's wardrobe photos
-- belong to the wardrobe service, and showing them under BOQ preparation
-- would be misleading.
-- ---------------------------------------------------------------------------

create table public.service_portfolio (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services (id) on delete cascade,
  -- Set when the sample is an existing Medosha project rather than a loose
  -- image, so the two stay in step.
  project_id uuid references public.projects (id) on delete set null,

  title text,
  description text,
  image_url text,
  video_url text,
  completed_on date,
  value numeric(14, 2) check (value >= 0),
  currency text not null default 'ETB',
  position smallint not null default 0,
  created_at timestamptz not null default now(),

  constraint service_portfolio_has_content check (
    image_url is not null or video_url is not null or project_id is not null
  )
);

create index service_portfolio_service_idx
  on public.service_portfolio (service_id, position);

-- ---------------------------------------------------------------------------
-- service_certificates
-- ---------------------------------------------------------------------------

create table public.service_certificates (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services (id) on delete cascade,
  name text not null,
  issuer text,
  issued_on date,
  expires_on date,
  document_url text,
  -- Set by an administrator after checking the document; a self-declared
  -- certificate is shown, but not as verified.
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

create index service_certificates_service_idx
  on public.service_certificates (service_id);

-- ---------------------------------------------------------------------------
-- service_bookmarks and service_follows
-- Bookmarks are private ("come back to this"); follows are public and feed
-- notifications ("tell me when this changes"). Two different intents, so two
-- tables rather than one with a flag.
-- ---------------------------------------------------------------------------

create table public.service_bookmarks (
  service_id uuid not null references public.services (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (service_id, user_id)
);

create index service_bookmarks_user_idx
  on public.service_bookmarks (user_id, created_at desc);

create table public.service_follows (
  service_id uuid not null references public.services (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (service_id, user_id)
);

-- ---------------------------------------------------------------------------
-- service_events
-- The analytics spine. One append-only table of what happened, rather than a
-- counter column per metric: a counter cannot answer "how did views convert
-- to quote requests last month", and this can.
-- ---------------------------------------------------------------------------

create type public.service_event_kind as enum (
  'view',
  'search_appearance',
  'profile_visit',
  'quote_request',
  'message',
  'call',
  'whatsapp',
  'bookmark',
  'follow',
  'bid_submitted',
  'bid_accepted',
  'job_completed'
);

create table public.service_events (
  id bigserial primary key,
  service_id uuid not null references public.services (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  kind public.service_event_kind not null,
  -- Set on the events that carry money, so revenue is a sum over this table.
  value numeric(14, 2),
  currency text not null default 'ETB',
  created_at timestamptz not null default now()
);

-- The analytics queries are always "this service, this window, by kind".
create index service_events_service_time_idx
  on public.service_events (service_id, created_at desc);
create index service_events_kind_idx
  on public.service_events (service_id, kind, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.service_portfolio enable row level security;
alter table public.service_certificates enable row level security;
alter table public.service_bookmarks enable row level security;
alter table public.service_follows enable row level security;
alter table public.service_events enable row level security;

create policy "Portfolio follows its service"
  on public.service_portfolio for select
  to authenticated, anon
  using (
    exists (
      select 1 from public.services s
      where s.id = service_portfolio.service_id
        and (s.status = 'published' or s.provider_id = auth.uid())
    )
  );

create policy "Providers manage their portfolio"
  on public.service_portfolio for all
  to authenticated
  using (
    exists (
      select 1 from public.services s
      where s.id = service_portfolio.service_id and s.provider_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.services s
      where s.id = service_portfolio.service_id and s.provider_id = auth.uid()
    )
  );

create policy "Certificates are viewable by everyone"
  on public.service_certificates for select
  to authenticated, anon
  using (true);

create policy "Providers manage their certificates"
  on public.service_certificates for all
  to authenticated
  using (
    exists (
      select 1 from public.services s
      where s.id = service_certificates.service_id and s.provider_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.services s
      where s.id = service_certificates.service_id and s.provider_id = auth.uid()
    )
  );

-- A bookmark is private to the person who made it; only the count is public.
create policy "Users manage their own bookmarks"
  on public.service_bookmarks for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Service follows are viewable by everyone"
  on public.service_follows for select
  to authenticated, anon
  using (true);

create policy "Users manage their own service follows"
  on public.service_follows for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Only the provider reads their own analytics. Anyone may write an event
-- about a service, because a view is recorded by the person doing the viewing.
create policy "Providers read their own analytics"
  on public.service_events for select
  to authenticated
  using (
    exists (
      select 1 from public.services s
      where s.id = service_events.service_id and s.provider_id = auth.uid()
    )
  );

create policy "Anyone can record a service event"
  on public.service_events for insert
  to authenticated, anon
  with check (actor_id is null or actor_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Counters
-- Recomputed from the rows, for the same reason as everywhere else: a count
-- that is adjusted can drift, and a count that is recomputed cannot.
-- ---------------------------------------------------------------------------

create function public.refresh_service_bookmarks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.service_id, old.service_id);
begin
  update public.services
  set bookmark_count = (
    select count(*) from public.service_bookmarks where service_id = target
  )
  where id = target;
  return coalesce(new, old);
end;
$$;

create trigger service_bookmarks_refresh
  after insert or delete on public.service_bookmarks
  for each row
  execute function public.refresh_service_bookmarks();

create function public.refresh_service_follows()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.service_id, old.service_id);
begin
  update public.services
  set follower_count = (
    select count(*) from public.service_follows where service_id = target
  )
  where id = target;
  return coalesce(new, old);
end;
$$;

create trigger service_follows_refresh
  after insert or delete on public.service_follows
  for each row
  execute function public.refresh_service_follows();

/**
 * Keeps the quote-request counter in step with the event log.
 *
 * Only this one kind gets a column, because it is the number that appears on
 * the card; the rest are read from service_events on demand.
 */
create function public.refresh_quote_requests()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind <> 'quote_request' then
    return new;
  end if;

  update public.services
  set quote_request_count = (
    select count(*) from public.service_events
    where service_id = new.service_id and kind = 'quote_request'
  )
  where id = new.service_id;

  return new;
end;
$$;

create trigger service_events_refresh_quotes
  after insert on public.service_events
  for each row
  execute function public.refresh_quote_requests();

-- ---------------------------------------------------------------------------
-- Analytics
-- ---------------------------------------------------------------------------

/**
 * Every headline metric for one service over a window, in one call.
 *
 * A single pass with FILTER rather than a query per metric: the page shows
 * them together, and twelve round trips to fill one card is twelve chances to
 * be slow.
 */
create function public.service_analytics(
  target_service_id uuid,
  days integer default 30
)
returns table (
  views bigint,
  search_appearances bigint,
  quote_requests bigint,
  messages bigint,
  calls bigint,
  profile_visits bigint,
  bookmarks bigint,
  bids_submitted bigint,
  bids_accepted bigint,
  jobs_completed bigint,
  revenue numeric,
  average_bid numeric,
  conversion_rate numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with window_events as (
    select * from public.service_events
    where service_id = target_service_id
      and created_at > now() - make_interval(days => days)
  ),
  counted as (
    select
      count(*) filter (where kind = 'view')::bigint as views,
      count(*) filter (where kind = 'search_appearance')::bigint as search_appearances,
      count(*) filter (where kind = 'quote_request')::bigint as quote_requests,
      count(*) filter (where kind = 'message')::bigint as messages,
      count(*) filter (where kind in ('call', 'whatsapp'))::bigint as calls,
      count(*) filter (where kind = 'profile_visit')::bigint as profile_visits,
      count(*) filter (where kind = 'bookmark')::bigint as bookmarks,
      count(*) filter (where kind = 'bid_submitted')::bigint as bids_submitted,
      count(*) filter (where kind = 'bid_accepted')::bigint as bids_accepted,
      count(*) filter (where kind = 'job_completed')::bigint as jobs_completed,
      coalesce(sum(value) filter (where kind = 'job_completed'), 0) as revenue,
      round(avg(value) filter (where kind = 'bid_submitted'), 2) as average_bid
    from window_events
  )
  select
    views, search_appearances, quote_requests, messages, calls, profile_visits,
    bookmarks, bids_submitted, bids_accepted, jobs_completed, revenue, average_bid,
    -- Quote requests per hundred views. Zero views is 0, not a division error.
    case when views = 0 then 0
         else round((quote_requests::numeric / views) * 100, 2) end
  from counted;
$$;

/** Daily counts of one event kind, for the sparkline on the analytics page. */
create function public.service_event_trend(
  target_service_id uuid,
  target_kind public.service_event_kind,
  days integer default 30
)
returns table (day date, total bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    date_trunc('day', created_at)::date,
    count(*)::bigint
  from public.service_events
  where service_id = target_service_id
    and kind = target_kind
    and created_at > now() - make_interval(days => days)
  group by 1
  order by 1;
$$;

/**
 * Median minutes to first reply, over the provider's last 50 conversations.
 *
 * Median rather than mean: one holiday should not make a responsive supplier
 * look slow for the next six months.
 */
create function public.refresh_response_time(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  median_minutes integer;
begin
  select percentile_cont(0.5) within group (
    order by extract(epoch from (reply.created_at - first_in.created_at)) / 60
  )::integer
  into median_minutes
  from (
    select
      m.conversation_id,
      min(m.created_at) as created_at
    from public.messages m
    where m.sender_id <> target_user_id
      and exists (
        select 1 from public.conversation_participants cp
        where cp.conversation_id = m.conversation_id
          and cp.user_id = target_user_id
      )
    group by m.conversation_id
    order by min(m.created_at) desc
    limit 50
  ) first_in
  join lateral (
    select min(m2.created_at) as created_at
    from public.messages m2
    where m2.conversation_id = first_in.conversation_id
      and m2.sender_id = target_user_id
      and m2.created_at > first_in.created_at
  ) reply on reply.created_at is not null;

  update public.profiles
  set response_minutes = median_minutes
  where id = target_user_id;

  update public.services
  set response_minutes = median_minutes
  where provider_id = target_user_id;
end;
$$;

/**
 * Records an analytics event.
 *
 * Security definer with its own actor check so a page can log a view for a
 * signed-out visitor without granting anonymous inserts anywhere else.
 */
create function public.record_service_event(
  target_service_id uuid,
  target_kind public.service_event_kind,
  event_value numeric default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.service_events (service_id, actor_id, kind, value)
  values (target_service_id, auth.uid(), target_kind, event_value);
$$;

grant execute on function public.service_analytics(uuid, integer) to authenticated;
grant execute on function public.service_event_trend(uuid, public.service_event_kind, integer) to authenticated;
grant execute on function public.refresh_response_time(uuid) to authenticated;
grant execute on function public.record_service_event(uuid, public.service_event_kind, numeric) to anon, authenticated;
