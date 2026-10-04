-- Phase 2.1: Real-time messaging.
--
-- Direct (person-to-person) and company conversations, with attachments,
-- read receipts and unread counts. Additive only — no existing table is
-- altered.
--
-- Read receipts are derived from per-participant watermarks
-- (last_delivered_at / last_read_at) rather than a row per message per
-- reader: for the one-to-one and small-group conversations this app has,
-- two timestamps answer "sent / delivered / read" without a table that
-- grows with participants x messages.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.conversation_kind as enum ('direct', 'company');

-- What the conversation was started from, so an inquiry can be shown in
-- context ("about this project") without a join table per entity.
create type public.message_context as enum (
  'project',
  'product',
  'company',
  'profile'
);

-- ---------------------------------------------------------------------------
-- conversations
-- company_id is set only for company conversations; the check keeps the two
-- kinds from drifting apart.
-- ---------------------------------------------------------------------------

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind public.conversation_kind not null default 'direct',
  company_id uuid references public.companies (id) on delete cascade,
  context_type public.message_context,
  context_id uuid,
  subject text,
  created_by uuid not null references public.profiles (id) on delete cascade,
  last_message_at timestamptz not null default now(),
  last_message_preview text,
  last_message_sender_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_company_kind_ck
    check ((kind = 'company') = (company_id is not null)),
  constraint conversations_context_ck
    check ((context_type is null) = (context_id is null))
);

comment on table public.conversations is
  'A messaging thread between profiles, optionally about a company or listing.';

create index conversations_company_idx
  on public.conversations (company_id)
  where company_id is not null;
create index conversations_last_message_idx
  on public.conversations (last_message_at desc);

create trigger conversations_set_updated_at
  before update on public.conversations
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- conversation_participants
-- 'epoch' watermarks mean "has never read / never received", so a new
-- participant sees the whole history as unread.
-- ---------------------------------------------------------------------------

create table public.conversation_participants (
  conversation_id uuid not null
    references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default 'epoch',
  last_delivered_at timestamptz not null default 'epoch',
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index conversation_participants_user_idx
  on public.conversation_participants (user_id);

-- ---------------------------------------------------------------------------
-- messages
-- body may be empty when the message carries only attachments; the server
-- action rejects a message that has neither.
-- ---------------------------------------------------------------------------

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null default '',
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

create index messages_conversation_created_idx
  on public.messages (conversation_id, created_at desc);
create index messages_sender_idx on public.messages (sender_id);

-- ---------------------------------------------------------------------------
-- message_attachments
-- storage_path points into the private 'message-attachments' bucket; the app
-- hands out short-lived signed URLs rather than public links.
-- ---------------------------------------------------------------------------

create table public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  created_at timestamptz not null default now()
);

create index message_attachments_message_idx
  on public.message_attachments (message_id);

-- ---------------------------------------------------------------------------
-- Membership helper
-- Every policy below routes through this. It is security definer so that
-- checking "am I in this conversation?" does not itself re-enter the
-- participants policy and recurse.
-- ---------------------------------------------------------------------------

create function public.is_conversation_participant(
  conversation_id uuid,
  user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_participants p
    where p.conversation_id = is_conversation_participant.conversation_id
      and p.user_id = is_conversation_participant.user_id
  );
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- A conversation is visible only to its participants, and a message can only
-- be written by its own sender into a conversation they belong to.
-- ---------------------------------------------------------------------------

alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
alter table public.message_attachments enable row level security;

create policy "Participants can view their conversations"
  on public.conversations for select
  to authenticated
  using (public.is_conversation_participant(id, auth.uid()));

create policy "Participants can update their conversations"
  on public.conversations for update
  to authenticated
  using (public.is_conversation_participant(id, auth.uid()))
  with check (public.is_conversation_participant(id, auth.uid()));

create policy "Participants can view conversation membership"
  on public.conversation_participants for select
  to authenticated
  using (public.is_conversation_participant(conversation_id, auth.uid()));

create policy "Users can update their own membership"
  on public.conversation_participants for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Participants can read messages"
  on public.messages for select
  to authenticated
  using (public.is_conversation_participant(conversation_id, auth.uid()));

create policy "Participants can send messages"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_conversation_participant(conversation_id, auth.uid())
  );

create policy "Senders can edit their own messages"
  on public.messages for update
  to authenticated
  using (sender_id = auth.uid())
  with check (sender_id = auth.uid());

create policy "Participants can read attachments"
  on public.message_attachments for select
  to authenticated
  using (
    exists (
      select 1
      from public.messages m
      where m.id = message_attachments.message_id
        and public.is_conversation_participant(m.conversation_id, auth.uid())
    )
  );

create policy "Senders can attach files to their own messages"
  on public.message_attachments for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.messages m
      where m.id = message_attachments.message_id
        and m.sender_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Conversation summary maintained on write
-- Keeps the inbox list to a single indexed read instead of a lateral join
-- against messages for every row.
-- ---------------------------------------------------------------------------

create function public.touch_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set last_message_at = new.created_at,
      last_message_preview = left(
        coalesce(nullif(btrim(new.body), ''), 'Attachment'),
        140
      ),
      last_message_sender_id = new.sender_id,
      updated_at = now()
  where id = new.conversation_id;

  -- A sender has by definition read their own message.
  update public.conversation_participants
  set last_read_at = new.created_at,
      last_delivered_at = new.created_at
  where conversation_id = new.conversation_id
    and user_id = new.sender_id;

  return new;
end;
$$;

create trigger messages_touch_conversation
  after insert on public.messages
  for each row
  execute function public.touch_conversation_on_message();

-- ---------------------------------------------------------------------------
-- Start or reuse a direct conversation
-- Reuses the existing thread between the two people so the "Message" button
-- never creates duplicates.
-- ---------------------------------------------------------------------------

create function public.start_direct_conversation(
  other_user_id uuid,
  context_type public.message_context default null,
  context_id uuid default null,
  subject text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  existing uuid;
  created uuid;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;
  if other_user_id is null or other_user_id = me then
    raise exception 'Pick someone else to message';
  end if;
  if not exists (select 1 from public.profiles where id = other_user_id) then
    raise exception 'That person no longer exists';
  end if;

  select c.id into existing
  from public.conversations c
  where c.kind = 'direct'
    and exists (
      select 1 from public.conversation_participants p
      where p.conversation_id = c.id and p.user_id = me
    )
    and exists (
      select 1 from public.conversation_participants p
      where p.conversation_id = c.id and p.user_id = other_user_id
    )
    and (
      select count(*) from public.conversation_participants p
      where p.conversation_id = c.id
    ) = 2
  order by c.last_message_at desc
  limit 1;

  if existing is not null then
    return existing;
  end if;

  insert into public.conversations (kind, created_by, context_type, context_id, subject)
  values ('direct', me, context_type, context_id, subject)
  returning id into created;

  insert into public.conversation_participants (conversation_id, user_id)
  values (created, me), (created, other_user_id);

  return created;
end;
$$;

-- ---------------------------------------------------------------------------
-- Start or reuse a conversation with a company
-- The company's owner joins as the replying side. An unclaimed company has
-- no owner yet, so the thread waits for them: messages are kept and the owner
-- is added when they claim it.
-- ---------------------------------------------------------------------------

create function public.start_company_conversation(
  target_company_id uuid,
  context_type public.message_context default null,
  context_id uuid default null,
  subject text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  owner uuid;
  existing uuid;
  created uuid;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;

  select c.owner_id into owner
  from public.companies c
  where c.id = target_company_id;

  if not found then
    raise exception 'That company no longer exists';
  end if;

  select c.id into existing
  from public.conversations c
  where c.kind = 'company'
    and c.company_id = target_company_id
    and exists (
      select 1 from public.conversation_participants p
      where p.conversation_id = c.id and p.user_id = me
    )
  order by c.last_message_at desc
  limit 1;

  if existing is not null then
    -- Owner may have claimed the company after the thread started.
    if owner is not null and owner <> me then
      insert into public.conversation_participants (conversation_id, user_id)
      values (existing, owner)
      on conflict do nothing;
    end if;
    return existing;
  end if;

  insert into public.conversations
    (kind, company_id, created_by, context_type, context_id, subject)
  values
    ('company', target_company_id, me, context_type, context_id, subject)
  returning id into created;

  insert into public.conversation_participants (conversation_id, user_id)
  values (created, me);

  if owner is not null and owner <> me then
    insert into public.conversation_participants (conversation_id, user_id)
    values (created, owner);
  end if;

  return created;
end;
$$;

-- ---------------------------------------------------------------------------
-- Read state
-- ---------------------------------------------------------------------------

create function public.mark_conversation_read(target_conversation_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.conversation_participants
  set last_read_at = now(),
      last_delivered_at = greatest(last_delivered_at, now())
  where conversation_id = target_conversation_id
    and user_id = auth.uid();
$$;

-- Called when the client is connected so the sender's ticks can advance to
-- "delivered" even while the recipient has not opened the thread.
create function public.mark_conversations_delivered()
returns void
language sql
security definer
set search_path = public
as $$
  update public.conversation_participants
  set last_delivered_at = now()
  where user_id = auth.uid();
$$;

create function public.unread_message_count()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::bigint
  from public.messages m
  join public.conversation_participants p
    on p.conversation_id = m.conversation_id
   and p.user_id = auth.uid()
  where m.sender_id <> auth.uid()
    and m.deleted_at is null
    and m.created_at > p.last_read_at;
$$;

-- ---------------------------------------------------------------------------
-- Inbox
-- One call returns every thread with its counterpart, last message and unread
-- count, so the conversation list never issues a query per row.
-- ---------------------------------------------------------------------------

create function public.list_conversations()
returns table (
  id uuid,
  kind public.conversation_kind,
  subject text,
  context_type public.message_context,
  context_id uuid,
  last_message_at timestamptz,
  last_message_preview text,
  last_message_sender_id uuid,
  unread_count bigint,
  company_id uuid,
  company_name text,
  company_slug text,
  company_logo_url text,
  other_user_id uuid,
  other_full_name text,
  other_username text,
  other_avatar_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.kind,
    c.subject,
    c.context_type,
    c.context_id,
    c.last_message_at,
    c.last_message_preview,
    c.last_message_sender_id,
    (
      select count(*)::bigint
      from public.messages m
      where m.conversation_id = c.id
        and m.sender_id <> auth.uid()
        and m.deleted_at is null
        and m.created_at > me.last_read_at
    ) as unread_count,
    c.company_id,
    co.name as company_name,
    co.slug as company_slug,
    co.logo_url as company_logo_url,
    other.id as other_user_id,
    other.full_name as other_full_name,
    other.username as other_username,
    other.avatar_url as other_avatar_url
  from public.conversations c
  join public.conversation_participants me
    on me.conversation_id = c.id and me.user_id = auth.uid()
  left join public.companies co on co.id = c.company_id
  left join lateral (
    select pr.id, pr.full_name, pr.username, pr.avatar_url
    from public.conversation_participants p
    join public.profiles pr on pr.id = p.user_id
    where p.conversation_id = c.id
      and p.user_id <> auth.uid()
    order by p.joined_at
    limit 1
  ) other on true
  order by c.last_message_at desc;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant execute on function public.is_conversation_participant(uuid, uuid)
  to authenticated;
grant execute on function public.start_direct_conversation(
  uuid, public.message_context, uuid, text
) to authenticated;
grant execute on function public.start_company_conversation(
  uuid, public.message_context, uuid, text
) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.mark_conversations_delivered() to authenticated;
grant execute on function public.unread_message_count() to authenticated;
grant execute on function public.list_conversations() to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- Guarded so the migration also runs on a plain Postgres (tests, local
-- verification) where Supabase's publication does not exist.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
    alter publication supabase_realtime add table public.conversations;
    alter publication supabase_realtime add table public.conversation_participants;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Attachment storage
-- Private bucket: message files are readable only through signed URLs issued
-- to participants, never by public link. Objects are stored under
-- <conversation_id>/... so membership can be checked from the path.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message-attachments',
  'message-attachments',
  false,
  26214400,
  array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip',
    'application/x-zip-compressed'
  ]
);

create policy "Participants can read message attachments"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'message-attachments'
    and public.is_conversation_participant(
      ((storage.foldername(name))[1])::uuid,
      auth.uid()
    )
  );

create policy "Participants can upload message attachments"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'message-attachments'
    and public.is_conversation_participant(
      ((storage.foldername(name))[1])::uuid,
      auth.uid()
    )
  );

create policy "Uploaders can remove their message attachments"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'message-attachments'
    and owner = auth.uid()
  );
