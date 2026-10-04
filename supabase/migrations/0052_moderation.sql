-- ---------------------------------------------------------------------------
-- Content safety: quarantine, moderation, reports, strikes and appeals
-- ---------------------------------------------------------------------------
--
-- Every upload on Medosha today goes straight from the browser to a public
-- bucket. `single-image-input`, `project-images-input`, `product-images-input`,
-- `avatar-upload` and `cover-upload` all call `storage.from(...).upload(...)`
-- and then `getPublicUrl`, which means an explicit image is world-readable the
-- instant it finishes uploading and before any server has seen it.
--
-- That is the hole this migration closes. Uploads land in a private quarantine
-- bucket, a server decides, and only an approved file is copied to a public
-- one. Nothing here weakens an existing policy: the public buckets keep their
-- rules and simply stop being the first place a file lands.
--
-- ## Why the tables are shaped this way
--
-- One central record per piece of content, whatever kind it is, because the
-- alternative — a moderation column on posts, another on products, another on
-- profiles — is five schemas to keep in step and a moderation queue that has to
-- union five tables. `content_type` plus `content_id` costs a little
-- referential integrity and buys one queue, one audit trail, and a new feature
-- that becomes moderatable by inserting a row.
--
-- Nothing stores the content itself. The record points at it. A moderation
-- system that kept copies of what it rejected would be a database full of
-- exactly the material it exists to keep off the platform.

-- ---------------------------------------------------------------------------
-- Who may moderate
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists is_admin boolean not null default false,
  add column if not exists is_moderator boolean not null default false;

comment on column public.profiles.is_moderator is
  'May act on the moderation queue. Admins imply moderators; the two are separate so moderation can be delegated without granting everything else.';

-- Definer, so the check itself is not subject to the policies it guards, and
-- revoked from `public` so it cannot be probed by an anonymous caller.
create or replace function public.is_moderator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_admin or p.is_moderator from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

revoke all on function public.is_moderator() from public;
grant execute on function public.is_moderator() to authenticated;

-- ---------------------------------------------------------------------------
-- Vocabulary
-- ---------------------------------------------------------------------------

-- Declared weakest-first so ordinal comparison matches severity, the same
-- convention the rest of Medosha's enums follow.
do $$ begin
  create type public.moderation_status as enum (
    -- Uploaded, not yet decided. Content in this state is never public.
    'pending',
    -- A human should look. Hidden from the public meanwhile — this is the
    -- state uncertainty resolves to, never 'blocked'.
    'review',
    -- Cleared. The only state that may be published.
    'safe',
    -- Refused. Never published, and the uploader is told why in general terms.
    'blocked'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.moderation_category as enum (
    'sexual_explicit',
    -- Kept distinct from the above and never auto-resolvable. See the
    -- `csam_never_safe` constraint below.
    'sexual_minors',
    'harassment',
    'hate',
    'threats',
    'violence',
    'scam',
    'spam',
    'illegal',
    'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.moderation_action as enum (
    'auto_approved',
    'auto_flagged',
    'auto_blocked',
    'moderator_approved',
    'moderator_removed',
    'moderator_deleted',
    'user_reported',
    'appeal_granted',
    'appeal_denied'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.content_kind as enum (
    'project', 'project_image', 'product', 'product_image',
    'company', 'profile_avatar', 'profile_cover',
    -- Named ahead of the features that will use them, so a new surface calls
    -- the same service instead of inventing a parallel one.
    'post', 'comment', 'listing', 'video'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.strike_level as enum ('warning', 'restricted', 'suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.appeal_status as enum ('none', 'open', 'granted', 'denied');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- The central record
-- ---------------------------------------------------------------------------

create table if not exists public.moderation_items (
  id uuid primary key default gen_random_uuid(),

  content_type public.content_kind not null,
  -- Not a foreign key, deliberately: it points into whichever table owns the
  -- content, and there is no way to reference several tables from one column.
  -- The cost is that a deleted row can leave an orphan; the audit trail is
  -- meant to outlive the content anyway.
  content_id uuid,

  user_id uuid references auth.users (id) on delete cascade,

  status public.moderation_status not null default 'pending',
  category public.moderation_category,
  -- The provider's own words, already shortened. Never shown to the uploader:
  -- telling somebody exactly which rule they tripped is telling them how to
  -- get past it next time.
  reason text,
  -- 0..1. Null when the provider gives no score.
  confidence numeric(4, 3) check (confidence is null or (confidence >= 0 and confidence <= 1)),

  provider text,
  model text,

  -- Where the bytes are while they wait. Path in the quarantine bucket.
  quarantine_path text,
  -- Where they went once approved. Null until then, and the only URL a page
  -- may render.
  public_path text,

  report_count integer not null default 0 check (report_count >= 0),
  appeal_status public.appeal_status not null default 'none',
  last_action public.moderation_action,

  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,

  -- A decision by a person must say who made it. Without this a row can claim
  -- to be moderator-approved with nobody's name on it.
  constraint moderation_reviewed_has_reviewer check (
    (reviewed_at is null and reviewed_by is null)
    or (reviewed_at is not null and reviewed_by is not null)
  ),

  -- The rule the whole system exists for. Suspected sexual content involving
  -- minors can never be marked safe — not by a provider, not by a moderator,
  -- not by an appeal. Enforced by the database so no code path can do it by
  -- accident.
  constraint csam_never_safe check (
    not (category = 'sexual_minors' and status = 'safe')
  ),

  -- Public means approved. A row cannot carry a public path while pending,
  -- under review or blocked, which makes "published without being cleared"
  -- unrepresentable rather than merely avoided.
  constraint public_path_requires_safe check (
    public_path is null or status = 'safe'
  )
);

create index if not exists moderation_items_queue_idx
  on public.moderation_items (status, created_at desc)
  where status in ('pending', 'review');

create index if not exists moderation_items_content_idx
  on public.moderation_items (content_type, content_id);

create index if not exists moderation_items_user_idx
  on public.moderation_items (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------

create table if not exists public.moderation_reports (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.moderation_items (id) on delete cascade,
  reporter_id uuid references auth.users (id) on delete set null,
  category public.moderation_category not null,
  note text,
  created_at timestamptz not null default now(),

  -- One report per person per item. Without this a single motivated user can
  -- run the report count up and push something into the queue by themselves.
  unique (item_id, reporter_id)
);

create index if not exists moderation_reports_item_idx
  on public.moderation_reports (item_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Strikes
-- ---------------------------------------------------------------------------

create table if not exists public.user_strikes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id uuid references public.moderation_items (id) on delete set null,
  level public.strike_level not null,
  category public.moderation_category,
  reason text,
  -- Null means indefinite. A restriction with an end date is the ordinary
  -- case; suspension is the one that usually has none.
  expires_at timestamptz,
  issued_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists user_strikes_user_idx
  on public.user_strikes (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Appeals
-- ---------------------------------------------------------------------------

create table if not exists public.moderation_appeals (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.moderation_items (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  reason text not null,
  status public.appeal_status not null default 'open',
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  submitted_at timestamptz not null default now(),

  -- One open appeal per item. Somebody who disagrees can say so once; a queue
  -- filled with the same complaint restated is a queue nobody works.
  unique (item_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------

create table if not exists public.moderation_audit (
  id bigserial primary key,
  item_id uuid references public.moderation_items (id) on delete set null,
  actor_id uuid references public.profiles (id) on delete set null,
  action public.moderation_action not null,
  -- What changed, in the system's own vocabulary. Never the content.
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists moderation_audit_item_idx
  on public.moderation_audit (item_id, created_at desc);

comment on table public.moderation_audit is
  'Append-only trail of every automated decision, moderator action, report and appeal. Readable by moderators only; never written by a member.';

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
--
-- Each policy is dropped before it is created. PostgreSQL has no
-- `create policy if not exists`, and everything else in this file is
-- re-runnable — a migration that fails the second time it is applied is one
-- nobody can iterate on safely.

alter table public.moderation_items enable row level security;
alter table public.moderation_reports enable row level security;
alter table public.user_strikes enable row level security;
alter table public.moderation_appeals enable row level security;
alter table public.moderation_audit enable row level security;

-- Items. A member sees the state of their own uploads — that is what drives
-- "Under review" in the interface — and nothing of anybody else's. Writes are
-- the server's alone: no policy grants insert or update to a member, so a
-- member cannot mark their own upload safe.
drop policy if exists "members read their own moderation items" on public.moderation_items;
create policy "members read their own moderation items"
  on public.moderation_items for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "moderators read every moderation item" on public.moderation_items;
create policy "moderators read every moderation item"
  on public.moderation_items for select to authenticated
  using (public.is_moderator());

drop policy if exists "moderators update moderation items" on public.moderation_items;
create policy "moderators update moderation items"
  on public.moderation_items for update to authenticated
  using (public.is_moderator())
  with check (public.is_moderator());

-- Reports. Anybody signed in may report; only the reporter and moderators may
-- read one back. Reports are not public — a visible report list is a tool for
-- pressuring whoever was reported.
drop policy if exists "members file reports" on public.moderation_reports;
create policy "members file reports"
  on public.moderation_reports for insert to authenticated
  with check (reporter_id = auth.uid());

drop policy if exists "reporters read their own reports" on public.moderation_reports;
create policy "reporters read their own reports"
  on public.moderation_reports for select to authenticated
  using (reporter_id = auth.uid());

drop policy if exists "moderators read every report" on public.moderation_reports;
create policy "moderators read every report"
  on public.moderation_reports for select to authenticated
  using (public.is_moderator());

-- Strikes. A member must be able to see their own — being restricted without
-- being told is not a system anybody can comply with.
drop policy if exists "members read their own strikes" on public.user_strikes;
create policy "members read their own strikes"
  on public.user_strikes for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "moderators read every strike" on public.user_strikes;
create policy "moderators read every strike"
  on public.user_strikes for select to authenticated
  using (public.is_moderator());

drop policy if exists "moderators issue strikes" on public.user_strikes;
create policy "moderators issue strikes"
  on public.user_strikes for insert to authenticated
  with check (public.is_moderator());

-- Appeals. Filed by the owner of the content, decided by a moderator.
drop policy if exists "members file appeals for their own content" on public.moderation_appeals;
create policy "members file appeals for their own content"
  on public.moderation_appeals for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.moderation_items i
      where i.id = item_id and i.user_id = auth.uid()
    )
  );

drop policy if exists "members read their own appeals" on public.moderation_appeals;
create policy "members read their own appeals"
  on public.moderation_appeals for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "moderators read every appeal" on public.moderation_appeals;
create policy "moderators read every appeal"
  on public.moderation_appeals for select to authenticated
  using (public.is_moderator());

drop policy if exists "moderators decide appeals" on public.moderation_appeals;
create policy "moderators decide appeals"
  on public.moderation_appeals for update to authenticated
  using (public.is_moderator())
  with check (public.is_moderator());

-- Audit. Read by moderators, written by nobody through the API — every insert
-- comes from the service role. There is deliberately no update or delete
-- policy at all: an audit trail that can be edited is not one.
drop policy if exists "moderators read the audit trail" on public.moderation_audit;
create policy "moderators read the audit trail"
  on public.moderation_audit for select to authenticated
  using (public.is_moderator());

-- ---------------------------------------------------------------------------
-- Quarantine storage
-- ---------------------------------------------------------------------------

-- Private. This is where an upload lands before anybody has looked at it, and
-- the entire point is that a URL to it is not a way to see it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'moderation-quarantine',
  'moderation-quarantine',
  false,
  26214400,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm']
)
on conflict (id) do nothing;

-- A member may put a file into their own folder and read back only their own.
-- Nobody may read anybody else's, which is what stops a quarantined file from
-- being fetched by whoever learns its path.
drop policy if exists "members upload to their own quarantine folder" on storage.objects;
create policy "members upload to their own quarantine folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'moderation-quarantine'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "members read their own quarantined files" on storage.objects;
create policy "members read their own quarantined files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'moderation-quarantine'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "moderators read quarantined files" on storage.objects;
create policy "moderators read quarantined files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'moderation-quarantine'
    and public.is_moderator()
  );

drop policy if exists "members delete their own quarantined files" on storage.objects;
create policy "members delete their own quarantined files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'moderation-quarantine'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- Report counting
-- ---------------------------------------------------------------------------

-- Kept in a column rather than counted on read: the queue sorts by it, and a
-- correlated count over a growing reports table is the first query to become
-- slow. The trigger is the only writer, so the column cannot drift.
create or replace function public.bump_report_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.moderation_items
  set report_count = report_count + 1,
      -- A reported item that was already cleared goes back for another look.
      -- It does not go straight to blocked: a report is an opinion, and one
      -- person's opinion must not be able to unpublish somebody's work.
      status = case when status = 'safe' then 'review'::public.moderation_status else status end,
      last_action = 'user_reported'
  where id = new.item_id;

  insert into public.moderation_audit (item_id, actor_id, action, detail)
  values (new.item_id, new.reporter_id, 'user_reported',
          jsonb_build_object('category', new.category));

  return new;
end;
$$;

drop trigger if exists moderation_reports_bump on public.moderation_reports;
create trigger moderation_reports_bump
  after insert on public.moderation_reports
  for each row execute function public.bump_report_count();
