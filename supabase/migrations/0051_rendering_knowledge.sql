-- ---------------------------------------------------------------------------
-- Rendering knowledge: versioned, and improvable without a deploy
-- ---------------------------------------------------------------------------
--
-- Two things, both small, both about the same problem: the hidden instructions
-- behind "Rain" and "Golden Hour" are the difference between a usable render
-- and a fantasy storm, and they will be wrong at first.
--
-- 1. Every render records which version of the knowledge produced it. When
--    somebody says "the renders were better last month", that is the difference
--    between a conversation and an investigation.
--
-- 2. An admin can improve an instruction without a code change. The defaults
--    ship in `src/lib/ai/rendering/knowledge.ts`; a row here replaces one.
--
-- The instructions are not secret from Medosha's own administrators — they are
-- the thing administrators are here to improve. They are secret from everybody
-- else, and the policies below are what make that true.

alter table public.ai_usage_logs
  add column if not exists knowledge_version text;

comment on column public.ai_usage_logs.knowledge_version is
  'Version of the rendering knowledge that produced this image. Null for anything that was not a render.';

-- ---------------------------------------------------------------------------
-- Overrides
-- ---------------------------------------------------------------------------

create table if not exists public.rendering_knowledge (
  -- The option id from `src/lib/ai/rendering/options.ts` — 'rain', 'golden-hour'.
  -- Deliberately the same string the UI already uses, so there is no second
  -- naming scheme to keep in step.
  option_id text primary key,
  category text not null,
  -- What actually reaches the image model. This is the payload.
  hidden_instructions text not null,
  -- Ids this option overrules, as the code's `overrules` does.
  overrules text[] not null default '{}',
  version text not null default '1.0.0',
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.rendering_knowledge is
  'Admin overrides for the rendering instructions. A row replaces the built-in default for one option; absent means the code default stands.';

alter table public.rendering_knowledge enable row level security;

-- Admins only. Not "authenticated" — an ordinary member reading this table
-- would be reading exactly the hidden instructions the brief says they must not
-- see, and there is no reason for a member's session to touch it at all.
-- The server reads it with the service role, which bypasses RLS by design.
create policy "admins read rendering knowledge"
  on public.rendering_knowledge for select
  using (public.is_admin());

create policy "admins write rendering knowledge"
  on public.rendering_knowledge for insert
  with check (public.is_admin());

create policy "admins update rendering knowledge"
  on public.rendering_knowledge for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "admins delete rendering knowledge"
  on public.rendering_knowledge for delete
  using (public.is_admin());

create index if not exists rendering_knowledge_category_idx
  on public.rendering_knowledge (category, option_id);

-- Deliberately no seed. The defaults live in code, where they are reviewed,
-- diffed and shipped with the release that depends on them. Copying them here
-- would create two sources of truth that drift the first time one is edited.
