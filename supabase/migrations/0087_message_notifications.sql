-- A message arrives and nothing tells you.
--
-- 0007 built conversations, participants, messages, attachments, read
-- watermarks and an unread count. 0010 built the notification tray, with
-- `'message'` already in `notification_kind`. Nothing ever joined the two: no
-- trigger, no call in the send action, nothing. So the bell stayed silent for
-- the one event people actually wait for, and the only way to learn somebody
-- had written to you was to open the inbox and look.
--
-- ## In the database, not in the send action
--
-- A message can be inserted from the send action, from a future API, from a
-- support script, or from the SQL editor. A notification created in one of
-- those paths is a notification missing from the other four. The trigger is
-- the only place that sees every insert.
--
-- ## One notification per conversation, not one per message
--
-- Somebody typing five lines in a row sends five messages. Five tray entries
-- for one conversation is not a record of anything, it is a tray nobody reads,
-- and marking them read one at a time is worse. So an unread notification for
-- a conversation is *updated* — new preview, new timestamp, moves to the top —
-- rather than duplicated. Once read, the next message starts a fresh one,
-- because that one is news again.
--
-- The uniqueness is a partial index rather than a check in the trigger: two
-- messages arriving in the same millisecond race, and the loser of that race
-- should collide with a constraint rather than quietly insert a second row.

begin;

-- ---------------------------------------------------------------------------
-- What a notification is about
-- ---------------------------------------------------------------------------
--
-- `href` already says where to go. These say what it *is*, which is a
-- different question and the one the tray needs to group and de-duplicate by:
-- two links to the same conversation can differ by a query string, and then
-- neither the index below nor "clicking it opens the right thread" holds.

alter table public.notifications
  add column if not exists entity_type text,
  add column if not exists entity_id uuid;

comment on column public.notifications.entity_type is
  'What this notification is about — conversation, job, property, order. With entity_id it is the de-duplication key, and href is derived from it rather than the other way round.';

-- One unread notification per person per thing.
--
-- Partial on `read_at is null` so history is kept: yesterday's read
-- notification about this conversation does not stop today's being created.
create unique index if not exists notifications_unread_entity_uniq
  on public.notifications (user_id, entity_type, entity_id)
  where read_at is null and entity_type is not null;

-- ---------------------------------------------------------------------------
-- The trigger
-- ---------------------------------------------------------------------------

create or replace function public.notify_message_recipients()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sender_name text;
  preview text;
begin
  -- A message with no body is an attachment-only message; the preview says so
  -- rather than showing an empty line.
  preview := nullif(btrim(coalesce(new.body, '')), '');
  if preview is null then
    preview := 'Sent an attachment';
  elsif length(preview) > 140 then
    preview := left(preview, 139) || '…';
  end if;

  select coalesce(p.full_name, p.company_name, p.username, 'Someone')
  into sender_name
  from public.profiles p
  where p.id = new.sender_id;

  insert into public.notifications (
    user_id, actor_id, kind, title, body, href, entity_type, entity_id
  )
  select
    cp.user_id,
    new.sender_id,
    'message',
    coalesce(sender_name, 'Someone'),
    preview,
    '/messages/' || new.conversation_id::text,
    'conversation',
    new.conversation_id
  from public.conversation_participants cp
  where cp.conversation_id = new.conversation_id
    -- Not to the person who wrote it.
    and cp.user_id <> new.sender_id
  on conflict (user_id, entity_type, entity_id)
    where read_at is null and entity_type is not null
  do update set
    title = excluded.title,
    body = excluded.body,
    actor_id = excluded.actor_id,
    -- Moves back to the top of the tray, which is the point of updating rather
    -- than inserting.
    created_at = now();

  return new;
end;
$$;

drop trigger if exists notify_message_recipients on public.messages;
create trigger notify_message_recipients
  after insert on public.messages
  for each row
  execute function public.notify_message_recipients();

-- ---------------------------------------------------------------------------
-- Reading the conversation clears the notification
-- ---------------------------------------------------------------------------
--
-- The brief's words: "reading the conversation clears the appropriate unread
-- state". Two unread states exist — the participant's `last_read_at`
-- watermark, which drives the message badge, and the tray entry, which drives
-- the bell. Opening the thread has to settle both, or the bell keeps claiming
-- an unread message the reader is looking at.
--
-- Same signature as 0007's, so this replaces it rather than overloading it.
create or replace function public.mark_conversation_read(target_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversation_participants
  set last_read_at = now(),
      last_delivered_at = greatest(last_delivered_at, now())
  where conversation_id = target_conversation_id
    and user_id = auth.uid();

  -- Only the caller's own row, and only if they are actually in the
  -- conversation — the update above is the check, but this runs as definer so
  -- it states the condition itself rather than inheriting it.
  update public.notifications
  set read_at = now()
  where user_id = auth.uid()
    and entity_type = 'conversation'
    and entity_id = target_conversation_id
    and read_at is null
    and exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = target_conversation_id
        and cp.user_id = auth.uid()
    );
end;
$$;

-- ---------------------------------------------------------------------------
-- Tray housekeeping, for the panel
-- ---------------------------------------------------------------------------

create or replace function public.mark_notification_read(target_notification uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.notifications
  set read_at = coalesce(read_at, now())
  where id = target_notification
    and user_id = auth.uid();
$$;

create or replace function public.delete_notification(target_notification uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.notifications
  where id = target_notification
    and user_id = auth.uid();
$$;

-- `from public, anon` rather than `from public` alone: a Supabase project
-- carries `alter default privileges ... grant execute on functions to anon,
-- authenticated, service_role`, so a new function is granted to `anon` by name
-- the moment it is created and revoking PUBLIC does not touch it.
revoke all on function public.mark_notification_read(uuid) from public, anon;
revoke all on function public.delete_notification(uuid) from public, anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.delete_notification(uuid) to authenticated;

commit;
