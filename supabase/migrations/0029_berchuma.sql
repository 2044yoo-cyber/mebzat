-- Berchuma Studio — the schema.
--
-- A design is a specification, not a drawing. The `spec` column holds the
-- typed JSON that Berchuma AI produces and that the geometry, costing and
-- cut-list services derive everything from; the 3D model, the price and the
-- panel list are computed, never stored, because a stored derivative is a
-- derivative that will one day disagree with its source.
--
-- What is stored is what cannot be recomputed: who made it, what it was
-- remixed from, which renders were generated, and what somebody asked to have
-- built.
--
-- Almost nothing here is new. Authorship reuses `profiles`, the social layer
-- reuses `feed_posts` and its likes, comments, saves and follows, quoting
-- reuses `project_briefs` and `brief_bids`, and the conversation reuses
-- `ai_conversations`. Six tables is what is genuinely missing.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- All of this file, or none of it.
-- ---------------------------------------------------------------------------
--
-- The Supabase SQL editor does not stop at the first error — it runs every
-- statement in what you pasted and reports the failures afterwards. A file
-- that fails halfway therefore leaves half of itself behind, and the next
-- migration fails on a missing object with no hint about which file is
-- actually absent. That is how a database ends up with `designs` but not
-- `manufacturing_requests`.
--
-- An explicit transaction fixes it properly: the first error aborts, every
-- later statement is refused, and nothing is committed. Re-running after the
-- cause is fixed then starts from a clean state rather than from a mess.
--
-- PostgreSQL runs DDL inside transactions, so this is safe for every statement
-- below. It is not safe for `alter type ... add value`, which is why the enum
-- additions live in 0028 and are not wrapped.
begin;

create type public.design_visibility as enum (
  'private',   -- only the owner
  'unlisted',  -- anyone with the link, not in search or the feed
  'public'
);

create type public.design_asset_kind as enum (
  'cover',
  'render',
  'panorama',
  'drawing',
  'export'
);

create type public.manufacturing_status as enum (
  'requested',
  'quoted',
  'accepted',
  'in_production',
  'delivered',
  'cancelled'
);

-- ---------------------------------------------------------------------------
-- designs
-- ---------------------------------------------------------------------------

create table public.designs (
  id uuid primary key default gen_random_uuid(),
  -- Part of the public URL, so it is generated once and never changes: a
  -- shared link that stops working because somebody renamed their wardrobe is
  -- a broken promise.
  slug text not null unique,

  owner_id uuid not null references public.profiles (id) on delete cascade,
  company_id uuid references public.companies (id) on delete set null,

  -- Deliberately text rather than an enum. Kitchen Studio, House Studio and
  -- Landscape Studio are on the roadmap, and a new studio should not need a
  -- migration to store its first design. The application validates this
  -- against the DesignKind union.
  kind text not null,

  title text not null check (length(title) between 1 and 160),
  prompt text,

  -- The whole design. Validated by Zod on the way in and on the way out;
  -- Postgres holds it, it does not interpret it.
  spec jsonb not null,

  cover_url text,

  currency text not null default 'ETB',
  -- Snapshotted at publish time so a listing does not change price silently
  -- when a supplier's rate moves. The studio always recomputes from the spec.
  estimated_cost numeric(14, 2),
  -- What share of that estimate came from live supplier listings. Stored
  -- because a public page has to be able to say how firm its number is.
  price_confidence numeric(5, 2),

  visibility public.design_visibility not null default 'private',

  is_template boolean not null default false,
  -- Null means free. Non-null needs a payment path, which does not exist yet;
  -- the column is here so the schema does not need changing when it does.
  template_price numeric(14, 2) check (template_price is null or template_price >= 0),

  -- Attribution. Set by the server in `berchuma_remix`, never by a client.
  parent_design_id uuid references public.designs (id) on delete set null,
  -- The original at the head of the chain, so "23 remixes" can be counted
  -- without walking a linked list on every page load.
  root_design_id uuid references public.designs (id) on delete set null,

  remix_count integer not null default 0,
  view_count integer not null default 0,
  order_count integer not null default 0,

  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A published design must have been published at some point.
  constraint designs_published_ck check (
    (visibility = 'private') or (published_at is not null)
  )
);

comment on table public.designs is
  'A Berchuma design. `spec` is the source of truth; geometry, cost and cut lists are derived from it, never stored.';
comment on column public.designs.root_design_id is
  'The original at the head of a remix chain, so descendants can be counted without walking the tree.';

create index designs_owner_idx on public.designs (owner_id, created_at desc);
create index designs_public_idx
  on public.designs (published_at desc)
  where visibility = 'public';
create index designs_kind_idx
  on public.designs (kind, published_at desc)
  where visibility = 'public';
create index designs_template_idx
  on public.designs (published_at desc)
  where is_template and visibility = 'public';
create index designs_parent_idx on public.designs (parent_design_id)
  where parent_design_id is not null;
create index designs_root_idx on public.designs (root_design_id)
  where root_design_id is not null;
create index designs_search_idx
  on public.designs
  using gin (to_tsvector('simple', title || ' ' || coalesce(prompt, '')));

create trigger designs_set_updated_at
  before update on public.designs
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- design_versions
--
-- Every accepted edit, in order. This is what makes "make it wider" safe: the
-- previous spec is still there, so an edit that ruins a design is one click
-- from being undone rather than a conversation the user has to redo.
-- ---------------------------------------------------------------------------

create table public.design_versions (
  id uuid primary key default gen_random_uuid(),
  design_id uuid not null references public.designs (id) on delete cascade,
  version integer not null check (version >= 1),
  spec jsonb not null,
  -- What changed, in the words the user used: "make it wider", "change to oak".
  note text,
  author_id uuid references public.profiles (id) on delete set null,
  estimated_cost numeric(14, 2),
  created_at timestamptz not null default now(),
  unique (design_id, version)
);

create index design_versions_design_idx
  on public.design_versions (design_id, version desc);

-- ---------------------------------------------------------------------------
-- design_assets
--
-- Generated images and exported files. Renders live in a public bucket
-- because they are the cover of a public page; exports live in a private one
-- because a CNC file is the thing somebody paid for.
-- ---------------------------------------------------------------------------

create table public.design_assets (
  id uuid primary key default gen_random_uuid(),
  design_id uuid not null references public.designs (id) on delete cascade,
  kind public.design_asset_kind not null,
  url text not null,
  -- The prompt and provider behind a render, so it can be regenerated and so
  -- the studio can say which model produced it.
  provider text,
  model text,
  prompt text,
  width integer,
  height integer,
  position smallint not null default 0,
  created_at timestamptz not null default now()
);

create index design_assets_design_idx
  on public.design_assets (design_id, kind, position);

-- ---------------------------------------------------------------------------
-- design_conversations
--
-- The link between a design and the chat that produced it. A join table
-- rather than a column on `ai_conversations`, because that table belongs to
-- the wider AI feature and Berchuma should not be adding columns to it.
-- ---------------------------------------------------------------------------

create table public.design_conversations (
  design_id uuid not null references public.designs (id) on delete cascade,
  conversation_id uuid not null
    references public.ai_conversations (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (design_id, conversation_id)
);

-- ---------------------------------------------------------------------------
-- manufacturing_requests
--
-- Somebody wants this built. The commercial conversation then happens in
-- `project_briefs` and `brief_bids`, which already model a quote properly —
-- price, timeline, warranty, what is and is not included. Berchuma does not
-- reimplement quoting; it opens one.
-- ---------------------------------------------------------------------------

create table public.manufacturing_requests (
  id uuid primary key default gen_random_uuid(),
  design_id uuid not null references public.designs (id) on delete cascade,
  requester_id uuid not null references public.profiles (id) on delete cascade,
  -- Set when the request is aimed at one maker rather than open to bids.
  maker_id uuid references public.profiles (id) on delete set null,
  maker_company_id uuid references public.companies (id) on delete set null,

  -- The brief this opened, so the bids are found through the existing flow.
  brief_id uuid references public.project_briefs (id) on delete set null,

  status public.manufacturing_status not null default 'requested',
  -- The cut list as it stood when the request was made. Frozen on purpose:
  -- the design may be edited afterwards, and the shop must build what was
  -- agreed rather than whatever the spec says today.
  cut_list jsonb,
  quoted_price numeric(14, 2),
  currency text not null default 'ETB',
  note text,

  city text,
  needed_by date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index manufacturing_requests_design_idx
  on public.manufacturing_requests (design_id, created_at desc);
create index manufacturing_requests_requester_idx
  on public.manufacturing_requests (requester_id, created_at desc);
create index manufacturing_requests_maker_idx
  on public.manufacturing_requests (maker_id, status)
  where maker_id is not null;

create trigger manufacturing_requests_set_updated_at
  before update on public.manufacturing_requests
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- template_grants
--
-- Who may duplicate a template. A free template grants on first use; a priced
-- one will grant on payment, once there is a payment path. The table is the
-- gate the private export bucket checks, so it exists now rather than later.
-- ---------------------------------------------------------------------------

create table public.template_grants (
  template_id uuid not null references public.designs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- What was paid, if anything. Zero for a free template.
  amount numeric(14, 2) not null default 0,
  currency text not null default 'ETB',
  granted_at timestamptz not null default now(),
  primary key (template_id, user_id)
);

create index template_grants_user_idx
  on public.template_grants (user_id, granted_at desc);

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'designs',
  'designs',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Private, and it matters. A DWG or a cut list is the deliverable somebody
-- either created or paid for; a public bucket would make every paid template
-- free to anyone who could guess a filename.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'design-exports',
  'design-exports',
  false,
  52428800,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/vnd.dxf',
    'application/octet-stream'
  ]
)
on conflict (id) do nothing;

-- Renders are world-readable; only the owner writes into their own folder.
create policy "design renders are public"
  on storage.objects for select
  using (bucket_id = 'designs');

create policy "owners upload their own renders"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'designs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "owners replace their own renders"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'designs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "owners delete their own renders"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'designs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Exports: the owner, or somebody holding a grant on the template.
create policy "exports are readable by owner or grantee"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'design-exports'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1
        from public.template_grants g
        join public.designs d on d.id = g.template_id
        where g.user_id = auth.uid()
          and d.owner_id::text = (storage.foldername(name))[1]
      )
    )
  );

create policy "owners write their own exports"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'design-exports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.designs enable row level security;
alter table public.design_versions enable row level security;
alter table public.design_assets enable row level security;
alter table public.design_conversations enable row level security;
alter table public.manufacturing_requests enable row level security;
alter table public.template_grants enable row level security;

-- Unlisted means "anyone with the link". There is no way to express that in
-- RLS beyond making it readable — the secrecy is in the unguessable slug, and
-- it is described to the user as exactly that, not as privacy.
create policy designs_read on public.designs
  for select using (
    visibility in ('public', 'unlisted') or owner_id = auth.uid()
  );

-- Lineage and counters are not the client's to set.
--
-- Without these conditions a user can insert a design carrying
-- `parent_design_id` pointing at somebody else's work — claiming a remix
-- relationship that never happened — and open with `remix_count = 9999`.
-- Both were possible until this policy said otherwise; the attack was run
-- against the schema and succeeded.
--
-- `berchuma_remix` sets lineage legitimately and is SECURITY DEFINER, so it
-- bypasses this policy. Every other path must leave these columns alone.
create policy designs_insert on public.designs
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    and parent_design_id is null
    and root_design_id is null
    and remix_count = 0
    and view_count = 0
    and order_count = 0
  );

create policy designs_update on public.designs
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy designs_delete on public.designs
  for delete to authenticated using (owner_id = auth.uid());

-- Versions and assets inherit their parent's visibility. Written as an
-- `exists` against `designs`, which re-applies the policy above rather than
-- restating it — one rule, one place.
create policy design_versions_read on public.design_versions
  for select using (
    exists (select 1 from public.designs d where d.id = design_id)
  );

create policy design_versions_write on public.design_versions
  for insert to authenticated
  with check (
    exists (
      select 1 from public.designs d
      where d.id = design_id and d.owner_id = auth.uid()
    )
  );

create policy design_assets_read on public.design_assets
  for select using (
    exists (select 1 from public.designs d where d.id = design_id)
  );

create policy design_assets_write on public.design_assets
  for all to authenticated
  using (
    exists (
      select 1 from public.designs d
      where d.id = design_id and d.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.designs d
      where d.id = design_id and d.owner_id = auth.uid()
    )
  );

-- A conversation is private to its owner even when the design is public: the
-- design is the output, the conversation is the working.
create policy design_conversations_own on public.design_conversations
  for all to authenticated
  using (
    exists (
      select 1 from public.ai_conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.ai_conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

create policy manufacturing_requests_read on public.manufacturing_requests
  for select to authenticated
  using (
    requester_id = auth.uid()
    or maker_id = auth.uid()
    or exists (
      select 1 from public.designs d
      where d.id = design_id and d.owner_id = auth.uid()
    )
  );

create policy manufacturing_requests_insert on public.manufacturing_requests
  for insert to authenticated with check (requester_id = auth.uid());

-- Either side may move the request along; the maker quotes, the requester
-- accepts or cancels.
create policy manufacturing_requests_update on public.manufacturing_requests
  for update to authenticated
  using (requester_id = auth.uid() or maker_id = auth.uid())
  with check (requester_id = auth.uid() or maker_id = auth.uid());

create policy template_grants_read on public.template_grants
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.designs d
      where d.id = template_id and d.owner_id = auth.uid()
    )
  );

-- A grant is taken by the person receiving it. Free templates are self-serve;
-- a priced one will be granted by a payment webhook running as service_role,
-- which bypasses this policy.
create policy template_grants_claim on public.template_grants
  for insert to authenticated with check (user_id = auth.uid());

-- An UPDATE cannot be constrained the same way — RLS has no access to the old
-- row, so "did this column change?" is not expressible in a policy. A trigger
-- can see both, and simply puts back what the client tried to change.
create or replace function public.designs_freeze_provenance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The counters have to be writable by something, and that something is the
  -- two functions below. They announce themselves with a transaction-local
  -- setting; everything else is a client and gets its changes put back.
  --
  -- Without this escape hatch the trigger reverts berchuma_record_view and
  -- berchuma_remix as well, which is exactly what happened on the first
  -- attempt: the guard worked and the view counter silently stopped moving.
  if current_setting('berchuma.internal', true) = '1' then
    return new;
  end if;

  new.slug := old.slug;
  new.owner_id := old.owner_id;
  new.parent_design_id := old.parent_design_id;
  new.root_design_id := old.root_design_id;
  new.remix_count := old.remix_count;
  new.view_count := old.view_count;
  new.order_count := old.order_count;
  return new;
end;
$$;

comment on function public.designs_freeze_provenance is
  'Restores authorship, lineage and counters on update. They are set by berchuma_remix and berchuma_record_view, never by a client.';

create trigger designs_provenance
  before update on public.designs
  for each row
  execute function public.designs_freeze_provenance();

-- ---------------------------------------------------------------------------
-- Slugs
--
-- A design's URL is `/designs/luxury-walnut-wardrobe-82734`. The suffix is not
-- decoration: two people will name a wardrobe the same thing on the same day,
-- and a slug collision under concurrency is a failed publish at the worst
-- possible moment.
-- ---------------------------------------------------------------------------

create or replace function public.design_slug(title text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  base text;
  candidate text;
  attempt integer := 0;
begin
  base := lower(coalesce(nullif(trim(title), ''), 'design'));
  base := regexp_replace(base, '[^a-z0-9]+', '-', 'g');
  base := trim(both '-' from base);
  base := left(base, 60);
  if base = '' then base := 'design'; end if;

  loop
    -- Five digits, so the URL stays readable and the space is large enough
    -- that a retry is rare.
    candidate := base || '-' || lpad((floor(random() * 90000) + 10000)::text, 5, '0');
    exit when not exists (select 1 from public.designs d where d.slug = candidate);

    attempt := attempt + 1;
    -- After ten collisions something is wrong with the assumption, not with
    -- luck. Fall back to something that cannot collide.
    if attempt >= 10 then
      candidate := base || '-' || replace(gen_random_uuid()::text, '-', '');
      exit;
    end if;
  end loop;

  return candidate;
end;
$$;

grant execute on function public.design_slug(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Remixing
--
-- The one operation that must not be done from the client.
--
-- Parentage is a claim about authorship. If a client posted `parent_design_id`
-- it could claim to have remixed anything, or — worse — omit it and take
-- credit for somebody else's design. So the server reads the source row,
-- copies its spec, and sets the lineage itself.
-- ---------------------------------------------------------------------------

create or replace function public.berchuma_remix(p_design uuid, p_title text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  source public.designs%rowtype;
  new_id uuid;
  new_title text;
begin
  if uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into source from public.designs where id = p_design;

  if not found then
    raise exception 'design not found' using errcode = 'P0002';
  end if;

  -- A private design belonging to somebody else cannot be remixed. Checked
  -- here because this function is security definer and therefore bypasses the
  -- read policy that would otherwise have stopped it.
  if source.visibility = 'private' and source.owner_id <> uid then
    raise exception 'design not found' using errcode = 'P0002';
  end if;

  new_title := coalesce(nullif(trim(p_title), ''), source.title || ' (remix)');

  insert into public.designs (
    slug, owner_id, kind, title, prompt, spec, cover_url, currency,
    estimated_cost, price_confidence, visibility,
    parent_design_id, root_design_id
  )
  values (
    public.design_slug(new_title),
    uid,
    source.kind,
    left(new_title, 160),
    source.prompt,
    source.spec,
    source.cover_url,
    source.currency,
    source.estimated_cost,
    source.price_confidence,
    'private',
    source.id,
    -- The head of the chain, not the immediate parent: a remix of a remix
    -- still belongs to the original.
    coalesce(source.root_design_id, source.id)
  )
  returning id into new_id;

  -- Transaction-local, so it cannot leak into another statement on a pooled
  -- connection.
  perform set_config('berchuma.internal', '1', true);
  update public.designs
     set remix_count = remix_count + 1
   where id in (source.id, coalesce(source.root_design_id, source.id));
  perform set_config('berchuma.internal', '0', true);

  -- Tell the original author, unless they are remixing their own work.
  if source.owner_id <> uid then
    insert into public.notifications (user_id, actor_id, kind, title, body, href)
    values (
      source.owner_id,
      uid,
      'design_remix',
      'Someone remixed your design',
      source.title,
      '/designs/' || (select slug from public.designs where id = new_id)
    );
  end if;

  return new_id;
end;
$$;

grant execute on function public.berchuma_remix(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------

create or replace function public.berchuma_record_view(p_design uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  perform set_config('berchuma.internal', '1', true);
  update public.designs
     set view_count = view_count + 1
   where id = p_design and visibility in ('public', 'unlisted');
  perform set_config('berchuma.internal', '0', true);
end;
$$;

grant execute on function public.berchuma_record_view(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Search
--
-- A separate function rather than a branch inside `global_search`.
--
-- `global_search` is a 300-line union of eleven branches. Adding a twelfth
-- means `create or replace` on the whole thing, which puts a second full copy
-- in the migration history and leaves the next person to diff two 300-line
-- functions to find one changed line. This returns the same row shape, the
-- application calls both and merges, and the next module to need searching
-- adds a function of its own rather than editing a monolith.
-- ---------------------------------------------------------------------------

create or replace function public.search_designs(
  q text,
  per_kind integer default 5
)
returns table (
  kind public.search_kind,
  id uuid,
  title text,
  subtitle text,
  detail text,
  image_url text,
  href text,
  score real
)
language sql
stable
security definer
set search_path = public
as $$
  with term as (
    select nullif(regexp_replace(trim(q), '\s+', ' ', 'g'), '') as text
  ),
  pattern as (
    select
      text,
      '%' || replace(replace(text, '%', '\%'), '_', '\_') || '%' as anywhere,
      replace(replace(text, '%', '\%'), '_', '\_') || '%' as prefix
    from term
    where text is not null
  )
  select
    'design'::public.search_kind,
    d.id,
    d.title,
    coalesce(p.full_name, p.company_name, 'Berchuma Studio'),
    case
      when d.estimated_cost is null then initcap(replace(d.kind, '_', ' '))
      else initcap(replace(d.kind, '_', ' ')) || ' · ' || d.currency || ' ' ||
           to_char(d.estimated_cost, 'FM999,999,999')
    end,
    d.cover_url,
    '/designs/' || d.slug,
    (case when d.title ilike pattern.prefix then 3.0 else 1.0 end)::real
  from public.designs d
  cross join pattern
  left join public.profiles p on p.id = d.owner_id
  where d.visibility = 'public'
    and (d.title ilike pattern.anywhere or d.prompt ilike pattern.anywhere)
  order by d.remix_count desc, d.published_at desc
  limit least(greatest(per_kind, 1), 20);
$$;

grant execute on function public.search_designs(text, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public listing
--
-- The gallery and the "related designs" rail. Kept as a function so the
-- ordering rule lives in one place rather than in every caller.
-- ---------------------------------------------------------------------------

create or replace function public.public_designs(
  p_limit integer default 12,
  p_kind text default null,
  p_templates_only boolean default false,
  p_exclude uuid default null
)
returns table (
  id uuid,
  slug text,
  kind text,
  title text,
  cover_url text,
  currency text,
  estimated_cost numeric,
  price_confidence numeric,
  is_template boolean,
  remix_count integer,
  view_count integer,
  published_at timestamptz,
  owner_id uuid,
  owner_name text,
  owner_username text,
  owner_avatar_url text
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    d.id, d.slug, d.kind, d.title, d.cover_url, d.currency,
    d.estimated_cost, d.price_confidence, d.is_template,
    d.remix_count, d.view_count, d.published_at,
    d.owner_id,
    coalesce(p.full_name, p.company_name) as owner_name,
    p.username as owner_username,
    p.avatar_url as owner_avatar_url
  from public.designs d
  left join public.profiles p on p.id = d.owner_id
  where d.visibility = 'public'
    and (p_kind is null or d.kind = p_kind)
    and (not p_templates_only or d.is_template)
    and (p_exclude is null or d.id <> p_exclude)
  order by d.remix_count desc, d.view_count desc, d.published_at desc
  limit least(greatest(p_limit, 1), 48);
$$;

grant execute on function public.public_designs(integer, text, boolean, uuid)
  to anon, authenticated;

commit;
