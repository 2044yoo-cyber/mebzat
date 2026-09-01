-- Phase 4: Reputation, the knowledge library, and team accounts.
--
-- Additive only.
--
-- Reputation is an append-only ledger, not a number on the profile that gets
-- adjusted. A score you cannot explain is a score nobody trusts, and "why do I
-- have 340 points" has to be answerable. The profile column is a cached sum.

-- ---------------------------------------------------------------------------
-- Reputation
-- ---------------------------------------------------------------------------

create type public.reputation_reason as enum (
  'verified_price',
  'helpful_answer',
  'accepted_answer',
  'completed_project',
  'positive_review',
  'fast_response',
  'successful_bid',
  'knowledge_contribution',
  'profile_completed',
  'penalty'
);

create table public.reputation_events (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  reason public.reputation_reason not null,
  points integer not null,
  -- What earned it, so the ledger can link back. Not a foreign key because it
  -- points at whichever table the reason implies.
  subject_type text,
  subject_id uuid,
  note text,
  created_at timestamptz not null default now()
);

create index reputation_events_user_idx
  on public.reputation_events (user_id, created_at desc);
-- Awarding twice for the same thing is the main failure mode; this makes the
-- guard an indexed lookup.
create index reputation_events_subject_idx
  on public.reputation_events (user_id, reason, subject_type, subject_id);

-- The published tariff. A table rather than constants in the app so the
-- values are visible to anyone reading the database, and adjustable without
-- a deploy.
create table public.reputation_rules (
  reason public.reputation_reason primary key,
  points integer not null,
  label text not null,
  description text
);

insert into public.reputation_rules (reason, points, label, description) values
  ('verified_price', 10, 'Verified a price', 'Contributed a price that held up against the market'),
  ('helpful_answer', 5, 'Helpful answer', 'An answer the community found useful'),
  ('accepted_answer', 15, 'Accepted answer', 'The asker marked your answer as the solution'),
  ('completed_project', 40, 'Completed a project', 'Delivered work through Medosha'),
  ('positive_review', 20, 'Positive review', 'Received a four or five star review'),
  ('fast_response', 5, 'Fast response', 'Replied to an enquiry within the hour'),
  ('successful_bid', 25, 'Won a bid', 'A client accepted your bid'),
  ('knowledge_contribution', 30, 'Published a guide', 'Added to the knowledge library'),
  ('profile_completed', 10, 'Completed profile', 'Filled in a full professional profile'),
  ('penalty', -50, 'Penalty', 'Applied by a moderator');

-- ---------------------------------------------------------------------------
-- Badges
-- Earned or granted, and always explainable.
-- ---------------------------------------------------------------------------

create type public.badge_slug as enum (
  'verified_supplier',
  'verified_professional',
  'top_contractor',
  'market_expert',
  'boq_expert',
  'interior_expert',
  'architecture_expert',
  'top_contributor',
  'trusted_company'
);

create table public.badges (
  slug public.badge_slug primary key,
  label text not null,
  description text not null,
  -- Null for badges only an administrator can grant.
  points_required integer,
  icon text
);

insert into public.badges (slug, label, description, points_required, icon) values
  ('verified_supplier', 'Verified Supplier', 'Identity and trade licence checked by Medosha', null, 'BadgeCheck'),
  ('verified_professional', 'Verified Professional', 'Qualifications checked by Medosha', null, 'BadgeCheck'),
  ('top_contractor', 'Top Contractor', 'Consistently high ratings across completed contracts', 500, 'HardHat'),
  ('market_expert', 'Market Expert', 'Trusted contributor of price data', 300, 'LineChart'),
  ('boq_expert', 'BOQ Expert', 'Recognised for bills of quantities', 300, 'ClipboardList'),
  ('interior_expert', 'Interior Expert', 'Recognised for interior work', 300, 'Sofa'),
  ('architecture_expert', 'Architecture Expert', 'Recognised for architectural work', 300, 'DraftingCompass'),
  ('top_contributor', 'Top Contributor', 'Among the most helpful members', 400, 'Star'),
  ('trusted_company', 'Trusted Company', 'Long record of delivered work', null, 'ShieldCheck');

create table public.user_badges (
  user_id uuid not null references public.profiles (id) on delete cascade,
  badge public.badge_slug not null references public.badges (slug) on delete cascade,
  awarded_at timestamptz not null default now(),
  awarded_by uuid references public.profiles (id) on delete set null,
  note text,
  primary key (user_id, badge)
);

create index user_badges_badge_idx on public.user_badges (badge);

-- ---------------------------------------------------------------------------
-- Knowledge library
-- Guides attached to a service, so expertise sits next to the offer it backs
-- up. The AI reads this before falling back to general knowledge.
-- ---------------------------------------------------------------------------

create type public.article_kind as enum (
  'installation_guide',
  'material_guide',
  'tutorial',
  'construction_tip',
  'maintenance_guide',
  'video',
  'case_study'
);

create type public.article_status as enum ('draft', 'published', 'archived');

create table public.knowledge_articles (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  service_id uuid references public.services (id) on delete set null,
  company_id uuid references public.companies (id) on delete set null,

  title text not null,
  slug text not null,
  summary text,
  body text not null check (length(body) between 1 and 100000),
  kind public.article_kind not null default 'construction_tip',

  category text,
  tags text[] not null default '{}',
  cover_image_url text,
  video_url text,
  reading_minutes smallint,

  view_count integer not null default 0,
  helpful_count integer not null default 0,

  -- Set once a reviewer has checked it. The AI prefers reviewed articles, and
  -- says which it used.
  reviewed boolean not null default false,
  reviewed_at timestamptz,

  status public.article_status not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint knowledge_slug_unique unique (author_id, slug)
);

create index knowledge_published_idx
  on public.knowledge_articles (created_at desc)
  where status = 'published';
create index knowledge_service_idx on public.knowledge_articles (service_id)
  where service_id is not null;
create index knowledge_kind_idx on public.knowledge_articles (kind, created_at desc);
create index knowledge_category_idx on public.knowledge_articles (category);
create index knowledge_tags_idx on public.knowledge_articles using gin (tags);

-- The AI retrieves from here by keyword before answering.
create index knowledge_search_idx
  on public.knowledge_articles
  using gin (
    to_tsvector(
      'english',
      coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(body, '')
    )
  );

create trigger knowledge_articles_set_updated_at
  before update on public.knowledge_articles
  for each row
  execute function public.set_updated_at();

create table public.article_helpful (
  article_id uuid not null references public.knowledge_articles (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (article_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Team accounts
-- ---------------------------------------------------------------------------

create type public.team_role as enum (
  'owner',
  'manager',
  'sales',
  'engineer',
  'designer',
  'estimator',
  'accountant',
  'marketing'
);

create type public.member_status as enum ('invited', 'active', 'suspended');

create table public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  -- Set while the invitation is outstanding and the person has no account yet.
  invited_email text,

  role public.team_role not null default 'sales',
  title text,
  status public.member_status not null default 'invited',

  invited_by uuid references public.profiles (id) on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint members_identified check (user_id is not null or invited_email is not null),
  constraint members_one_per_company unique (company_id, user_id)
);

create index company_members_company_idx on public.company_members (company_id);
create index company_members_user_idx on public.company_members (user_id);

create trigger company_members_set_updated_at
  before update on public.company_members
  for each row
  execute function public.set_updated_at();

-- What each role may do. Data rather than code so a policy can join to it and
-- the rules are the same on the server and in the UI.
create table public.role_permissions (
  role public.team_role primary key,
  manage_team boolean not null default false,
  manage_company boolean not null default false,
  manage_services boolean not null default false,
  manage_products boolean not null default false,
  submit_bids boolean not null default false,
  reply_messages boolean not null default false,
  view_analytics boolean not null default false,
  view_finance boolean not null default false,
  publish_content boolean not null default false
);

insert into public.role_permissions
  (role, manage_team, manage_company, manage_services, manage_products,
   submit_bids, reply_messages, view_analytics, view_finance, publish_content)
values
  ('owner',      true,  true,  true,  true,  true,  true,  true,  true,  true),
  ('manager',    true,  true,  true,  true,  true,  true,  true,  false, true),
  ('sales',      false, false, false, false, true,  true,  true,  false, false),
  ('engineer',   false, false, true,  false, true,  true,  false, false, true),
  ('designer',   false, false, true,  false, false, true,  false, false, true),
  ('estimator',  false, false, false, false, true,  true,  true,  false, false),
  ('accountant', false, false, false, false, false, false, true,  true,  false),
  ('marketing',  false, false, false, true,  false, true,  true,  false, true);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.reputation_events enable row level security;
alter table public.reputation_rules enable row level security;
alter table public.badges enable row level security;
alter table public.user_badges enable row level security;
alter table public.knowledge_articles enable row level security;
alter table public.article_helpful enable row level security;
alter table public.company_members enable row level security;
alter table public.role_permissions enable row level security;

-- The ledger is public: a reputation score nobody can audit is decoration.
create policy "Reputation events are viewable by everyone"
  on public.reputation_events for select
  to authenticated, anon
  using (true);

create policy "Reputation rules are viewable by everyone"
  on public.reputation_rules for select
  to authenticated, anon
  using (true);

create policy "Badges are viewable by everyone"
  on public.badges for select
  to authenticated, anon
  using (true);

create policy "Awarded badges are viewable by everyone"
  on public.user_badges for select
  to authenticated, anon
  using (true);

create policy "Published articles are viewable by everyone"
  on public.knowledge_articles for select
  to authenticated, anon
  using (status = 'published' or author_id = auth.uid());

create policy "Authors manage their own articles"
  on public.knowledge_articles for all
  to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "Helpful marks are viewable by everyone"
  on public.article_helpful for select
  to authenticated, anon
  using (true);

create policy "Users manage their own article marks"
  on public.article_helpful for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Role permissions are viewable by everyone"
  on public.role_permissions for select
  to authenticated, anon
  using (true);

-- Membership is public — a company's team is part of who they are — but only
-- someone who may manage the team can change it.
create policy "Company members are viewable by everyone"
  on public.company_members for select
  to authenticated, anon
  using (true);

/**
 * Whether the current user holds a permission at a company.
 *
 * Security definer so the policies below can call it without recursing
 * through company_members' own RLS.
 */
create function public.has_company_permission(
  target_company_id uuid,
  permission text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  allowed boolean;
begin
  -- The owner of the company always has every permission, whether or not
  -- they added themselves to the team.
  if exists (
    select 1 from public.companies
    where id = target_company_id and owner_id = auth.uid()
  ) then
    return true;
  end if;

  execute format(
    'select coalesce(bool_or(rp.%I), false)
     from public.company_members cm
     join public.role_permissions rp on rp.role = cm.role
     where cm.company_id = $1 and cm.user_id = $2 and cm.status = ''active''',
    permission
  )
  into allowed
  using target_company_id, auth.uid();

  return coalesce(allowed, false);
end;
$$;

create policy "Team managers manage the team"
  on public.company_members for all
  to authenticated
  using (public.has_company_permission(company_id, 'manage_team'))
  with check (public.has_company_permission(company_id, 'manage_team'));

-- A member may always accept or leave, which the manage_team policy would
-- otherwise deny them.
create policy "Members update their own membership"
  on public.company_members for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Reputation mechanics
-- ---------------------------------------------------------------------------

/**
 * Awards points once for a given (user, reason, subject).
 *
 * The guard is the whole point: reviews get edited, bids get re-accepted, and
 * a naive award would pay out every time.
 */
create function public.award_reputation(
  target_user_id uuid,
  award_reason public.reputation_reason,
  subject text default null,
  subject_uuid uuid default null,
  note text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  award integer;
begin
  select points into award
  from public.reputation_rules where reason = award_reason;
  if award is null then
    return 0;
  end if;

  if subject_uuid is not null and exists (
    select 1 from public.reputation_events
    where user_id = target_user_id
      and reason = award_reason
      and subject_type is not distinct from subject
      and subject_id = subject_uuid
  ) then
    return 0;
  end if;

  insert into public.reputation_events
    (user_id, reason, points, subject_type, subject_id, note)
  values (target_user_id, award_reason, award, subject, subject_uuid, note);

  -- The column is a cache of the ledger, so it is recomputed from it.
  update public.profiles
  set reputation_points = (
    select coalesce(sum(points), 0)
    from public.reputation_events where user_id = target_user_id
  )
  where id = target_user_id;

  perform public.refresh_earned_badges(target_user_id);

  return award;
end;
$$;

/** Grants any points-based badge the user now qualifies for. */
create function public.refresh_earned_badges(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  total integer;
begin
  select reputation_points into total
  from public.profiles where id = target_user_id;

  insert into public.user_badges (user_id, badge)
  select target_user_id, b.slug
  from public.badges b
  where b.points_required is not null
    and total >= b.points_required
  on conflict (user_id, badge) do nothing;
end;
$$;

-- A four or five star review earns the subject points, once per review.
create function public.reputation_from_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient uuid;
begin
  if new.rating < 4 then
    return new;
  end if;

  recipient := case new.subject_type
    when 'professional' then new.subject_id
    when 'company' then (select owner_id from public.companies where id = new.subject_id)
    when 'product' then (select owner_id from public.products where id = new.subject_id)
    when 'project' then (select owner_id from public.projects where id = new.subject_id)
    when 'service' then (select provider_id from public.services where id = new.subject_id)
    when 'equipment' then (select owner_id from public.equipment where id = new.subject_id)
  end;

  if recipient is null or recipient = new.author_id then
    return new;
  end if;

  perform public.award_reputation(
    recipient, 'positive_review', 'review', new.id, null
  );
  return new;
end;
$$;

create trigger reviews_award_reputation
  after insert on public.reviews
  for each row
  execute function public.reputation_from_review();

-- Winning a bid earns points, and counts towards the service's history.
create function public.reputation_from_bid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'accepted' or old.status = 'accepted' then
    return new;
  end if;

  perform public.award_reputation(
    new.bidder_id, 'successful_bid', 'brief_bid', new.id, null
  );

  if new.service_id is not null then
    update public.services
    set completed_projects = completed_projects + 1
    where id = new.service_id;
  end if;

  return new;
end;
$$;

create trigger brief_bids_award_reputation
  after update on public.brief_bids
  for each row
  execute function public.reputation_from_bid();

create function public.reputation_from_article()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'published' then
    return new;
  end if;

  perform public.award_reputation(
    new.author_id, 'knowledge_contribution', 'article', new.id, new.title
  );
  return new;
end;
$$;

create trigger knowledge_articles_award_reputation
  after insert on public.knowledge_articles
  for each row
  execute function public.reputation_from_article();

create function public.refresh_article_helpful()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.article_id, old.article_id);
begin
  update public.knowledge_articles
  set helpful_count = (
    select count(*) from public.article_helpful where article_id = target
  )
  where id = target;
  return coalesce(new, old);
end;
$$;

create trigger article_helpful_refresh
  after insert or delete on public.article_helpful
  for each row
  execute function public.refresh_article_helpful();

-- ---------------------------------------------------------------------------
-- Knowledge retrieval for the AI
-- ---------------------------------------------------------------------------

/**
 * The library passages most relevant to a question.
 *
 * The terms are OR-ed, not AND-ed. `plainto_tsquery` requires every word to
 * appear, which is right for a filter and wrong for retrieval: a user asks
 * "what thickness of MDF for a wardrobe carcass" and an AND query returns
 * nothing because no single article contains all six words. OR plus ranking
 * returns the best partial matches, which is the whole point of ranking.
 *
 * Reviewed articles are lifted above unreviewed ones — the assistant should
 * prefer knowledge somebody checked.
 */
create function public.search_knowledge(q text, max_results integer default 5)
returns table (
  id uuid,
  title text,
  summary text,
  body text,
  kind public.article_kind,
  author_id uuid,
  reviewed boolean,
  rank real
)
language sql
stable
security definer
set search_path = public
as $$
  with query as (
    select
      -- Lexemes from the question, OR-ed together. Going through
      -- plainto_tsquery first applies the same stemming and stop-word
      -- removal the index used, so the terms actually match.
      nullif(
        array_to_string(
          array(
            select lexeme
            from unnest(to_tsvector('english', q)) as t(lexeme)
          ),
          ' | '
        ),
        ''
      ) as expression
  ),
  parsed as (
    select to_tsquery('english', expression) as tsq
    from query
    where expression is not null
  )
  select
    a.id,
    a.title,
    a.summary,
    -- Enough for the model to quote from without flooding the context.
    left(a.body, 2000),
    a.kind,
    a.author_id,
    a.reviewed,
    (ts_rank(
      to_tsvector('english', coalesce(a.title, '') || ' ' || coalesce(a.summary, '') || ' ' || coalesce(a.body, '')),
      parsed.tsq
    ) * case when a.reviewed then 1.5 else 1.0 end)::real
  from public.knowledge_articles a
  cross join parsed
  where a.status = 'published'
    and to_tsvector('english', coalesce(a.title, '') || ' ' || coalesce(a.summary, '') || ' ' || coalesce(a.body, ''))
        @@ parsed.tsq
  order by 8 desc
  limit max_results;
$$;

create function public.increment_article_views(target_article_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.knowledge_articles
  set view_count = view_count + 1
  where id = target_article_id;
$$;

/** Everything a profile needs to show its standing, in one call. */
create function public.reputation_summary(target_user_id uuid)
returns table (
  points integer,
  rank_percentile numeric,
  badge_count bigint,
  completed_projects bigint,
  positive_reviews bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.reputation_points,
    -- Where they sit against everyone who has any points at all.
    (select round(
       100.0 * count(*) filter (where reputation_points <= p.reputation_points)
       / greatest(count(*), 1), 1)
     from public.profiles where reputation_points > 0),
    (select count(*) from public.user_badges where user_id = target_user_id),
    (select count(*) from public.reputation_events
     where user_id = target_user_id and reason in ('completed_project', 'successful_bid')),
    (select count(*) from public.reputation_events
     where user_id = target_user_id and reason = 'positive_review')
  from public.profiles p
  where p.id = target_user_id;
$$;

grant execute on function public.award_reputation(uuid, public.reputation_reason, text, uuid, text) to authenticated;
grant execute on function public.refresh_earned_badges(uuid) to authenticated;
grant execute on function public.has_company_permission(uuid, text) to authenticated;
grant execute on function public.search_knowledge(text, integer) to anon, authenticated;
grant execute on function public.increment_article_views(uuid) to anon, authenticated;
grant execute on function public.reputation_summary(uuid) to anon, authenticated;
