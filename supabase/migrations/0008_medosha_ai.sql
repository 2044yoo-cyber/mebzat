-- Medosha AI: conversations, messages, usage accounting and feedback.
--
-- Kept separate from the person-to-person messaging tables in 0007: those
-- model a thread between people, while these model a session between one user
-- and an assistant, with token accounting and provider metadata attached.
-- Additive only.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.ai_role as enum ('user', 'assistant', 'system');

-- Which specialist handled a turn. Stored so usage can be analysed per
-- capability, and so a reopened conversation resumes with the same agent.
create type public.ai_agent as enum (
  'construction',
  'materials',
  'marketplace',
  'companies',
  'professionals',
  'cost',
  'boq',
  'render',
  'drawings',
  'planner'
);

create type public.ai_feedback_rating as enum ('up', 'down');

-- ---------------------------------------------------------------------------
-- ai_conversations
-- ---------------------------------------------------------------------------

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null default 'New chat',
  agent public.ai_agent not null default 'construction',
  -- Set when the conversation was opened from a listing, so the assistant can
  -- answer "about this product" without the user restating it.
  context_type public.message_context,
  context_id uuid,
  archived_at timestamptz,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_conversations_context_ck
    check ((context_type is null) = (context_id is null))
);

comment on table public.ai_conversations is
  'One assistant session belonging to a single user.';

create index ai_conversations_user_idx
  on public.ai_conversations (user_id, last_message_at desc);

create trigger ai_conversations_set_updated_at
  before update on public.ai_conversations
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- ai_messages
-- provider/model/token columns are per message because a fallback can move a
-- single conversation between providers mid-session.
-- ---------------------------------------------------------------------------

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references public.ai_conversations (id) on delete cascade,
  role public.ai_role not null,
  content text not null,
  agent public.ai_agent,
  provider text,
  model text,
  prompt_tokens integer,
  completion_tokens integer,
  latency_ms integer,
  -- Identifiers of the rows quoted back to the user, so an answer can be
  -- traced to the catalogue records it was grounded in.
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index ai_messages_conversation_idx
  on public.ai_messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- ai_usage_logs
-- Written for every attempt, including failures, so the admin view can show
-- error rates and latency rather than only successful traffic.
-- ---------------------------------------------------------------------------

create table public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  conversation_id uuid references public.ai_conversations (id) on delete set null,
  agent public.ai_agent,
  provider text not null,
  model text not null,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  latency_ms integer not null default 0,
  ok boolean not null default true,
  error text,
  -- True when an earlier provider failed and this attempt was the fallback.
  fell_back boolean not null default false,
  created_at timestamptz not null default now()
);

create index ai_usage_logs_created_idx on public.ai_usage_logs (created_at desc);
create index ai_usage_logs_user_idx on public.ai_usage_logs (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- ai_saved_prompts
-- ---------------------------------------------------------------------------

create table public.ai_saved_prompts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  prompt text not null,
  agent public.ai_agent,
  created_at timestamptz not null default now()
);

create index ai_saved_prompts_user_idx on public.ai_saved_prompts (user_id);

-- ---------------------------------------------------------------------------
-- ai_feedback
-- One rating per user per message; re-rating replaces the previous verdict.
-- ---------------------------------------------------------------------------

create table public.ai_feedback (
  message_id uuid not null references public.ai_messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  rating public.ai_feedback_rating not null,
  comment text,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- A conversation and everything hanging off it belongs to exactly one user.
-- ---------------------------------------------------------------------------

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_usage_logs enable row level security;
alter table public.ai_saved_prompts enable row level security;
alter table public.ai_feedback enable row level security;

create policy "Users manage their own AI conversations"
  on public.ai_conversations for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Ownership is checked through the parent conversation. Security definer so
-- the lookup does not re-enter the conversations policy.
create function public.owns_ai_conversation(conversation_id uuid, user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.ai_conversations c
    where c.id = owns_ai_conversation.conversation_id
      and c.user_id = owns_ai_conversation.user_id
  );
$$;

create policy "Users read their own AI messages"
  on public.ai_messages for select
  to authenticated
  using (public.owns_ai_conversation(conversation_id, auth.uid()));

create policy "Users write into their own AI conversations"
  on public.ai_messages for insert
  to authenticated
  with check (public.owns_ai_conversation(conversation_id, auth.uid()));

create policy "Users delete their own AI messages"
  on public.ai_messages for delete
  to authenticated
  using (public.owns_ai_conversation(conversation_id, auth.uid()));

create policy "Users read their own usage"
  on public.ai_usage_logs for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users manage their own saved prompts"
  on public.ai_saved_prompts for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users manage their own feedback"
  on public.ai_feedback for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Conversation summary maintained on write
-- ---------------------------------------------------------------------------

create function public.touch_ai_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ai_conversations
  set last_message_at = new.created_at,
      updated_at = now(),
      -- The first thing the user says becomes the conversation's name, so the
      -- history list is readable without a separate titling round-trip.
      title = case
        when title = 'New chat' and new.role = 'user'
          then left(regexp_replace(new.content, '\s+', ' ', 'g'), 60)
        else title
      end
  where id = new.conversation_id;
  return new;
end;
$$;

create trigger ai_messages_touch_conversation
  after insert on public.ai_messages
  for each row
  execute function public.touch_ai_conversation();

-- ---------------------------------------------------------------------------
-- Rate limiting
-- Counts a user's requests inside a rolling window. Enforced server-side
-- before any provider call.
-- ---------------------------------------------------------------------------

create function public.ai_requests_in_window(window_seconds integer)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::bigint
  from public.ai_usage_logs
  where user_id = auth.uid()
    and created_at > now() - make_interval(secs => window_seconds);
$$;

grant execute on function public.owns_ai_conversation(uuid, uuid) to authenticated;
grant execute on function public.ai_requests_in_window(integer) to authenticated;
