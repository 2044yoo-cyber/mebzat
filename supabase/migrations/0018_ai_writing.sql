-- ---------------------------------------------------------------------------
-- 0018 — AI Writing Assistant
--
-- The writing assistant shares the provider chain and the usage log with the
-- chat assistant, but not its budget: a person refining a product description
-- fires many small requests, and those must not exhaust the thirty questions
-- an hour the chat assistant allows.
--
-- Rather than add a value to the ai_agent enum — which cannot be used in the
-- same transaction that adds it, and would make this file order-dependent —
-- usage rows are tagged with a plain `feature` column. Adding the next AI
-- surface then costs a string, not a migration.
-- ---------------------------------------------------------------------------

alter table public.ai_usage_logs
  add column if not exists feature text not null default 'chat';

comment on column public.ai_usage_logs.feature is
  'Which AI surface produced this row: chat, writer, and so on. Used to meter each surface separately.';

-- The rate-limit lookups are all (user, feature, recent), so the index leads
-- with those columns in that order.
create index if not exists ai_usage_logs_feature_idx
  on public.ai_usage_logs (user_id, feature, created_at desc);

-- ---------------------------------------------------------------------------
-- Per-feature rate limiting
-- ---------------------------------------------------------------------------

create or replace function public.ai_feature_requests_in_window(
  feature_name text,
  window_seconds integer
)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::bigint
  from public.ai_usage_logs
  where user_id = auth.uid()
    and feature = feature_name
    and created_at > now() - make_interval(secs => window_seconds);
$$;

-- Chat's own limiter now counts only chat. Before this it counted every row in
-- the table, so a writing session would have silently spent the chat budget.
create or replace function public.ai_requests_in_window(window_seconds integer)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::bigint
  from public.ai_usage_logs
  where user_id = auth.uid()
    and feature = 'chat'
    and created_at > now() - make_interval(secs => window_seconds);
$$;

grant execute on function public.ai_feature_requests_in_window(text, integer) to authenticated;
grant execute on function public.ai_requests_in_window(integer) to authenticated;
