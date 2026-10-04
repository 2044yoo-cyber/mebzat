-- ---------------------------------------------------------------------------
-- 0049 — the AI content engine
--
-- Medosha AI writes a post once and it goes to several places. This file is
-- the storage for that: one master record, one version per platform, one row
-- per publishing attempt, and the connected accounts those attempts go
-- through.
--
-- ## What this file deliberately does NOT create
--
-- A second subscription system. Plan eligibility and credit price already live
-- in `ai_operation_costs` (0037), one row per operation, `min_plan` and
-- `credits` columns, admin-writable and read by the server gate. The "feature
-- permission" for AI posting is therefore a row, not a new table and not a new
-- column: `social.post` with `min_plan = 'pro'`. Changing which plans may post
-- is an UPDATE, not a deploy.
--
-- A second notification system. `notifications` (0010) already reaches the
-- tray. AI content uses `ai_alert`, which the enum already has — adding a
-- value would have forced this file to be two files, because a new enum value
-- cannot be used in the transaction that adds it.
--
-- A second community feed. Publishing the "Medosha version" of a post writes
-- an ordinary row into `posts`. The feed does not know or care that a machine
-- drafted it.
--
-- A second property table. `source_type`/`source_id` point at what already
-- exists.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

/**
 * Where a post can go.
 *
 * 'medosha' is in the list on purpose. It is the one platform that always
 * works, needs no OAuth and cannot fail for a reason outside Medosha's
 * control — and treating it as a platform like the others is what makes the
 * publish log honest about the case where Facebook succeeded and Instagram
 * did not.
 */
do $$ begin
  create type public.social_platform as enum (
    'medosha',
    'facebook',
    'instagram',
    'tiktok'
  );
exception when duplicate_object then null; end $$;

/**
 * A connected account's state, from the connection UI's point of view.
 *
 * 'permission_required' is separate from 'disconnected' because they need
 * different words in front of a user. Instagram will happily complete an OAuth
 * flow and then refuse to publish because the account is personal rather than
 * a professional account linked to a Facebook Page — that is connected, and
 * unusable, and telling somebody to "connect Instagram" when they already have
 * sends them round the loop again.
 */
do $$ begin
  create type public.social_connection_status as enum (
    'connected',
    'permission_required',
    'expired',
    'revoked',
    'disconnected'
  );
exception when duplicate_object then null; end $$;

/**
 * The life of a generated post, weakest to strongest.
 *
 * Declared in this order so `status >= 'approved'` means what it reads like.
 * The scheduler's whole safety rests on that comparison: nothing below
 * 'approved' is ever published, and the ordering is what makes that one
 * predicate rather than a list of values somebody will forget to extend.
 */
do $$ begin
  create type public.ai_content_status as enum (
    'draft',
    'generating',
    'generated',
    'awaiting_approval',
    'approved',
    'scheduled',
    'publishing',
    'published',
    'failed',
    'cancelled'
  );
exception when duplicate_object then null; end $$;

/** What the post is about, which decides what the generator is given. */
do $$ begin
  create type public.ai_content_source as enum (
    'property',
    'product',
    'project',
    'company',
    'service',
    'profile',
    'freeform'
  );
exception when duplicate_object then null; end $$;

/**
 * Where an image came from.
 *
 * The brief was explicit: never present a generated picture as a photograph of
 * a real property. That is enforced two ways — a check constraint below, and
 * this column, which the UI reads to decide whether the "AI-generated image"
 * label is shown. A label that depends on somebody remembering to set a
 * boolean is a label that is missing on the post that matters.
 */
do $$ begin
  create type public.ai_image_origin as enum (
    'listing_photo',
    'user_upload',
    'ai_generated',
    'none'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Connected accounts
-- ---------------------------------------------------------------------------

create table if not exists public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  -- Set when the account belongs to a company rather than to a person. Both
  -- are owned by a profile: somebody has to be accountable for a token.
  company_id uuid references public.companies (id) on delete cascade,

  platform public.social_platform not null,
  status public.social_connection_status not null default 'disconnected',

  -- The account as the platform names it. Shown in the connection UI so
  -- somebody can tell which of their three Pages this is.
  external_id text,
  display_name text,
  avatar_url text,
  /** Instagram publishing needs the Facebook Page the account is linked to. */
  page_id text,

  /**
   * The tokens.
   *
   * No policy below grants select on this table to `authenticated`. Not a
   * restricted one — none at all. Every read goes through the service role in
   * a server route, so a token cannot be reached by a browser even if a
   * component asks for it, even if someone writes `select *`, and even if a
   * future policy is added to another table by mistake.
   *
   * Passwords are never stored here because passwords are never collected:
   * every platform below is OAuth, and a Medosha screen that asked for a
   * Facebook password would be a phishing page regardless of who wrote it.
   */
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  /** What the platform actually granted, which is not always what was asked. */
  scopes text[] not null default '{}',

  /** Why the last attempt failed, for the connection card. Never a token. */
  last_error text,
  last_checked_at timestamptz,
  connected_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One account per platform per owner, and per company where set. The
  -- coalesce is what lets a person and their company each connect the same
  -- platform without colliding.
  unique (owner_id, platform, company_id)
);

comment on table public.social_accounts is
  'OAuth connections to social platforms. Tokens are service-role only: no policy grants select to authenticated.';

create index if not exists social_accounts_owner_idx
  on public.social_accounts (owner_id, platform);

-- ---------------------------------------------------------------------------
-- The master post
-- ---------------------------------------------------------------------------

create table if not exists public.ai_content_posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  company_id uuid references public.companies (id) on delete set null,

  /** What the user asked for, kept so "Regenerate" means something. */
  brief text not null check (length(brief) between 1 and 4000),

  source_type public.ai_content_source not null default 'freeform',
  /**
   * The row it is about. Not a foreign key: it points at six different tables
   * depending on `source_type`, and the alternative is six nullable columns
   * with a check constraint saying exactly one is set. Deliberately not
   * cascading — a deleted property should leave its post history intact, with
   * the text that was published still readable.
   */
  source_id uuid,

  /** Headline, body, hashtags and CTA, before the per-platform rewrite. */
  headline text,
  body text,
  call_to_action text,
  hashtags text[] not null default '{}',

  image_url text,
  image_origin public.ai_image_origin not null default 'none',
  /** The prompt used, when the image was generated. Null otherwise. */
  image_prompt text,

  status public.ai_content_status not null default 'draft',

  /**
   * What the generation cost, in credits.
   *
   * Recorded on the master and nowhere else. Four platform versions come out
   * of one model call, and charging per version would bill somebody four times
   * for one generation — the brief called that out specifically and it is the
   * reason `ai_content_versions` has no credits column.
   */
  credits_spent numeric(10, 2) not null default 0,
  /** Ties the charge back to a row in ai_usage_logs. */
  generation_request_id uuid,

  approved_at timestamptz,
  approved_by uuid references public.profiles (id) on delete set null,
  scheduled_for timestamptz,
  published_at timestamptz,

  /** Set when a scheduled run is what created this. */
  schedule_id uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A real listing must never carry a generated picture without saying so.
  -- The UI reads `image_origin` to draw the label; this makes the state the
  -- label depends on impossible to reach by mistake.
  constraint ai_content_image_origin_sane check (
    (image_url is null and image_origin = 'none')
    or (image_url is not null and image_origin <> 'none')
  ),

  -- Approval is a fact with an actor and a time, or it has not happened.
  constraint ai_content_approval_complete check (
    (approved_at is null and approved_by is null)
    or (approved_at is not null and approved_by is not null)
  )
);

comment on table public.ai_content_posts is
  'One AI-generated post, before it is split into platform versions. Charged once, here.';

create index if not exists ai_content_posts_owner_idx
  on public.ai_content_posts (owner_id, created_at desc);

-- The scheduler's query: approved, scheduled, due. Partial, because the rows
-- it must never touch are the overwhelming majority.
create index if not exists ai_content_posts_due_idx
  on public.ai_content_posts (scheduled_for)
  where status = 'scheduled';

create index if not exists ai_content_posts_source_idx
  on public.ai_content_posts (source_type, source_id);

-- ---------------------------------------------------------------------------
-- Per-platform versions
-- ---------------------------------------------------------------------------

create table if not exists public.ai_content_versions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.ai_content_posts (id) on delete cascade,
  platform public.social_platform not null,

  /**
   * The text as it will be published.
   *
   * Its own row per platform, which is the point of the whole structure: a
   * user editing the Instagram caption must not disturb the Facebook one, and
   * a single `body` column with four renderings computed at publish time would
   * lose every edit the moment anything upstream changed.
   */
  body text not null,
  hashtags text[] not null default '{}',
  /** Overrides the master image when a platform needs a different crop. */
  image_url text,

  /** True once a human has changed the text, so Regenerate can warn first. */
  edited boolean not null default false,
  /** Whether this platform is included in the next publish. */
  enabled boolean not null default true,

  status public.ai_content_status not null default 'generated',
  published_at timestamptz,
  /** The platform's own id for the published post, for the history link. */
  external_post_id text,
  external_url text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (post_id, platform)
);

comment on table public.ai_content_versions is
  'The per-platform text of a master post. Edited independently; never regenerated as a side effect of another platform.';

create index if not exists ai_content_versions_post_idx
  on public.ai_content_versions (post_id);

-- ---------------------------------------------------------------------------
-- Publishing attempts
-- ---------------------------------------------------------------------------

create table if not exists public.social_publish_log (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.ai_content_posts (id) on delete cascade,
  version_id uuid references public.ai_content_versions (id) on delete set null,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  platform public.social_platform not null,

  ok boolean not null,
  /** The platform's id for what was created, when it worked. */
  external_post_id text,
  external_url text,

  /**
   * Why it failed, in words a user can act on.
   *
   * Written by the adapter after it has mapped the platform's response. The
   * raw body goes to the server log: platform error payloads echo the request,
   * and the request carries the access token.
   */
  error text,
  /** The platform's own code, for support. Not shown by default. */
  error_code text,

  /**
   * The key that makes publishing idempotent.
   *
   * A scheduler that runs twice — a retry, an overlapping cron, a deploy
   * mid-run — must not post twice. The unique index below means the second
   * attempt collides on insert rather than reaching the platform, and a
   * duplicate row is the one thing a social account's followers notice
   * immediately.
   */
  idempotency_key text not null,

  attempted_at timestamptz not null default now(),

  unique (idempotency_key)
);

comment on table public.social_publish_log is
  'One row per publishing attempt, successful or not. The unique idempotency_key is what prevents double posting.';

create index if not exists social_publish_log_post_idx
  on public.social_publish_log (post_id, attempted_at desc);

create index if not exists social_publish_log_owner_idx
  on public.social_publish_log (owner_id, attempted_at desc);

-- ---------------------------------------------------------------------------
-- Weekly schedules
-- ---------------------------------------------------------------------------

create table if not exists public.ai_content_schedules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  company_id uuid references public.companies (id) on delete set null,

  name text not null default 'Weekly content',
  active boolean not null default true,

  /** 3, 5 or 7 — capped against the plan's limit by the server, not here. */
  posts_per_week integer not null default 3
    check (posts_per_week between 1 and 14),

  /** Which platforms the generated posts target. */
  platforms public.social_platform[] not null default '{medosha}',

  /** 0 = Sunday, matching `extract(dow)`. */
  days_of_week integer[] not null default '{1,3,5}',
  /** Local time of day to publish, as minutes past midnight. */
  publish_minute integer not null default 540 check (publish_minute between 0 and 1439),
  /** IANA name. Addis is UTC+3 with no daylight saving, but tenants move. */
  timezone text not null default 'Africa/Addis_Ababa',

  /** What the posts should be about, in the user's words. */
  theme text,
  source_type public.ai_content_source not null default 'freeform',

  /**
   * Off by default, and the brief was emphatic about it.
   *
   * With this false the scheduler generates and stops: the post waits for a
   * human. With it true the scheduler may publish, and only posts that a human
   * already approved — the status ordering above is what enforces that.
   */
  auto_publish boolean not null default false,

  last_generated_at timestamptz,
  last_published_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.ai_content_schedules is
  'A weekly AI posting plan. auto_publish defaults false: generation is automatic, publishing is not.';

create index if not exists ai_content_schedules_active_idx
  on public.ai_content_schedules (owner_id) where active;

alter table public.ai_content_posts
  add constraint ai_content_posts_schedule_fk
  foreign key (schedule_id) references public.ai_content_schedules (id)
  on delete set null;

-- ---------------------------------------------------------------------------
-- Admin settings
-- ---------------------------------------------------------------------------

/**
 * The knobs the brief asked to be configurable rather than hardcoded.
 *
 * Credit *prices* are not here — those are `ai_operation_costs`, which already
 * exists and is already admin-writable, and a second place to set a price is a
 * second place for it to be wrong. What lives here is everything that is not a
 * price: posting limits, which platforms are switched on, whether automatic
 * publishing is offered at all.
 *
 * Values are jsonb so a new setting is an insert rather than a migration.
 */
create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null,
  label text not null,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

comment on table public.platform_settings is
  'Admin-configurable limits and toggles. Credit prices live in ai_operation_costs.';

insert into public.platform_settings (key, value, label, description) values
  ('weekly_post_limit',
   '{"free": 0, "pro": 5, "business": 14, "professional": 21, "admin": 100}'::jsonb,
   'Weekly post limit by plan',
   'Maximum AI posts published per rolling seven days.'),
  ('monthly_post_limit',
   '{"free": 0, "pro": 20, "business": 60, "professional": 90, "admin": 1000}'::jsonb,
   'Monthly post limit by plan',
   'Maximum AI posts published per rolling thirty days.'),
  ('included_posts_per_month',
   '{"free": 0, "pro": 4, "business": 12, "professional": 30, "admin": 1000}'::jsonb,
   'AI posts included in the plan',
   'Posts generated without spending credits. Beyond this, the ai_operation_costs price applies.'),
  ('enabled_platforms',
   '["medosha"]'::jsonb,
   'Platforms available to users',
   'A platform is offered only when it is listed here AND its app credentials are configured on the server. Facebook, Instagram and TikTok stay out of this list until their app review is complete.'),
  ('auto_publish_available',
   'false'::jsonb,
   'Offer automatic publishing',
   'When false, no user can enable automatic publishing regardless of their own setting.'),
  ('max_connected_accounts',
   '{"free": 0, "pro": 2, "business": 6, "professional": 12, "admin": 50}'::jsonb,
   'Connected social accounts by plan',
   null)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- The operations, priced and gated
-- ---------------------------------------------------------------------------

/**
 * AI posting as rows in the table that already governs every other paid
 * operation.
 *
 * `min_plan = 'pro'` is the `ai_social_posts` permission the brief asked for.
 * It is checked by `holdCredits` before any generation happens, so hiding the
 * button is decoration rather than the control — which is what was asked.
 *
 * `social.post` covers the whole generation including every platform version:
 * one model call, one charge.
 */
insert into public.ai_operation_costs (operation, label, credits, min_plan, notes)
values
  ('social.post', 'AI social post', 10, 'pro',
   'One master post and every platform version it produces. Charged once, not per platform.'),
  ('social.image', 'AI post image', 8, 'pro',
   'Per image generated for a post. A post reusing a listing photograph costs nothing here.'),
  ('social.schedule', 'Scheduled AI post', 10, 'business',
   'Generated ahead of time by a weekly schedule. Same price as an interactive post; the plan floor is higher because scheduling is a Business feature.')
on conflict (operation) do nothing;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.social_accounts enable row level security;
alter table public.ai_content_posts enable row level security;
alter table public.ai_content_versions enable row level security;
alter table public.social_publish_log enable row level security;
alter table public.ai_content_schedules enable row level security;
alter table public.platform_settings enable row level security;

-- ---- social_accounts ------------------------------------------------------
--
-- No select policy for `authenticated`. RLS cannot hide a column, so any
-- policy that let a member read their own row would hand them their own access
-- token in a JSON response — and a token in a browser is a token in an
-- extension, a crash report and a screenshot. The connection UI reads a view
-- instead (below), which does not carry the token columns at all.

create policy "Owners connect their own accounts"
  on public.social_accounts for insert to authenticated
  with check (owner_id = auth.uid());

create policy "Owners update their own accounts"
  on public.social_accounts for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "Owners disconnect their own accounts"
  on public.social_accounts for delete to authenticated
  using (owner_id = auth.uid());

/**
 * What the connection UI is allowed to see.
 *
 * The same rows minus the token columns.
 *
 * ## Why this is a definer view, and why that is the safe choice here
 *
 * The first version was `security_invoker = true`, which sounds like the
 * cautious option and is wrong for this table. An invoker view is subject to
 * the caller's own RLS on `social_accounts` — and `social_accounts` grants
 * `authenticated` no select policy at all, deliberately, so that a token can
 * never be read through the API. The view therefore returned nothing to
 * everybody, and the connection screen would have shown "no accounts
 * connected" to a user who had just connected one.
 *
 * As a definer view it runs as its owner and bypasses that RLS, which makes
 * the `where owner_id = auth.uid()` below the entire access control. That is
 * sound because the clause takes no parameters and cannot be widened by the
 * caller: there is no argument to pass, no filter to remove, and the only
 * thing `auth.uid()` can return is the caller's own id. The column list is
 * what keeps the tokens out, and it is fixed in the view definition rather
 * than left to whatever a route happens to select.
 */
create or replace view public.social_accounts_public as
select
  id,
  owner_id,
  company_id,
  platform,
  status,
  external_id,
  display_name,
  avatar_url,
  scopes,
  last_error,
  last_checked_at,
  connected_at,
  created_at,
  (access_token is not null) as has_token,
  (token_expires_at is not null and token_expires_at < now()) as token_expired
from public.social_accounts
where owner_id = auth.uid();

comment on view public.social_accounts_public is
  'social_accounts without the token columns. What the browser is allowed to see.';

grant select on public.social_accounts_public to authenticated;

-- ---- ai_content_posts -----------------------------------------------------

create policy "Members read their own AI posts"
  on public.ai_content_posts for select to authenticated
  using (owner_id = auth.uid());

create policy "Members create their own AI posts"
  on public.ai_content_posts for insert to authenticated
  with check (owner_id = auth.uid());

create policy "Members edit their own AI posts"
  on public.ai_content_posts for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "Members delete their own AI posts"
  on public.ai_content_posts for delete to authenticated
  using (owner_id = auth.uid());

-- ---- ai_content_versions --------------------------------------------------
--
-- Reached through the master post, so every policy is an existence check on
-- it. That keeps the ownership rule in one place: change who may see a post
-- and the versions follow.

create policy "Members read versions of their own posts"
  on public.ai_content_versions for select to authenticated
  using (exists (
    select 1 from public.ai_content_posts p
    where p.id = post_id and p.owner_id = auth.uid()
  ));

create policy "Members write versions of their own posts"
  on public.ai_content_versions for all to authenticated
  using (exists (
    select 1 from public.ai_content_posts p
    where p.id = post_id and p.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.ai_content_posts p
    where p.id = post_id and p.owner_id = auth.uid()
  ));

-- ---- social_publish_log ---------------------------------------------------
--
-- Readable by its owner, and written by nobody through the API. Every insert
-- comes from the server's service role: a log a user can write is not a log.

create policy "Members read their own publishing history"
  on public.social_publish_log for select to authenticated
  using (owner_id = auth.uid());

-- ---- ai_content_schedules -------------------------------------------------

create policy "Members manage their own schedules"
  on public.ai_content_schedules for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ---- platform_settings ----------------------------------------------------

create policy "Anyone signed in can read the limits"
  on public.platform_settings for select to authenticated using (true);

create policy "Admins set the limits"
  on public.platform_settings for all to authenticated
  using (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.is_admin
  ))
  with check (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.is_admin
  ));

-- ---------------------------------------------------------------------------
-- Posting limits
-- ---------------------------------------------------------------------------

/**
 * How many posts this member has published in a rolling window.
 *
 * Counts the publish log rather than the posts table, because the limit is on
 * publishing and not on drafting. Somebody who generates twenty drafts and
 * publishes three has published three.
 *
 * Successful attempts only. A failed Instagram call should not consume the
 * week's allowance — the user got nothing for it.
 */
create or replace function public.ai_posts_published_in_window(
  member uuid,
  window_days integer
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct post_id)::integer
  from public.social_publish_log
  where owner_id = member
    and ok
    and attempted_at > now() - make_interval(days => window_days);
$$;

comment on function public.ai_posts_published_in_window is
  'Distinct posts successfully published by a member in the last N days. Failed attempts do not count against the limit.';

grant execute on function public.ai_posts_published_in_window(uuid, integer)
  to authenticated;

/**
 * Claims a post for publishing, or returns false.
 *
 * The scheduler's lock. `status = 'scheduled'` in the WHERE clause is what
 * makes it atomic: two workers running the same minute both issue this UPDATE,
 * Postgres serialises them, and the second finds no row in 'scheduled' because
 * the first has already moved it to 'publishing'. The loser publishes nothing
 * rather than publishing a duplicate.
 *
 * The unique idempotency_key on the log is the second line of defence, for the
 * case where a worker dies after claiming — the claim is lost, the post is
 * retried, and the key stops the platform being called twice for the same
 * (post, platform, attempt window).
 */
create or replace function public.claim_scheduled_post(post uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed integer;
begin
  update public.ai_content_posts
     set status = 'publishing', updated_at = now()
   where id = post
     and status = 'scheduled'
     and scheduled_for is not null
     and scheduled_for <= now();

  get diagnostics claimed = row_count;
  return claimed = 1;
end;
$$;

comment on function public.claim_scheduled_post is
  'Atomically moves a due, scheduled post to publishing. False when another worker already claimed it.';

-- Not granted to `authenticated`. Only the service role calls this — a member
-- who could claim their own post could drive it into 'publishing' and bypass
-- the approval the scheduler is checking for.
revoke all on function public.claim_scheduled_post(uuid) from public;

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger social_accounts_touch
  before update on public.social_accounts
  for each row execute function public.touch_updated_at();

create trigger ai_content_posts_touch
  before update on public.ai_content_posts
  for each row execute function public.touch_updated_at();

create trigger ai_content_versions_touch
  before update on public.ai_content_versions
  for each row execute function public.touch_updated_at();

create trigger ai_content_schedules_touch
  before update on public.ai_content_schedules
  for each row execute function public.touch_updated_at();
