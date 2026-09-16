-- A message raises exactly one notification, to the right person, and reading
-- the conversation clears it.
--
-- Run after applying 0087. Prints one line per check and rolls itself back.
-- Exercised as `authenticated` with a jwt subject, because a superuser
-- bypasses row-level security and would prove nothing about the policies.

begin;

insert into auth.users (id, email) values
  ('55500000-0000-4000-8000-000000000001', 'writer@example.test'),
  ('55500000-0000-4000-8000-000000000002', 'reader@example.test'),
  ('55500000-0000-4000-8000-000000000003', 'outsider@example.test')
on conflict (id) do nothing;

update public.profiles set username = 'probe_writer', full_name = 'Meaza Bekele'
where id = '55500000-0000-4000-8000-000000000001';
update public.profiles set username = 'probe_reader', full_name = 'Dawit Tesfaye'
where id = '55500000-0000-4000-8000-000000000002';
update public.profiles set username = 'probe_outsider', full_name = 'Nobody Here'
where id = '55500000-0000-4000-8000-000000000003';

insert into public.conversations (id, kind, created_by)
values ('55500000-0000-4000-8000-00000000000a', 'direct',
        '55500000-0000-4000-8000-000000000001');

insert into public.conversation_participants (conversation_id, user_id) values
  ('55500000-0000-4000-8000-00000000000a', '55500000-0000-4000-8000-000000000001'),
  ('55500000-0000-4000-8000-00000000000a', '55500000-0000-4000-8000-000000000002');

-- ===================================================================
-- 1. Writing a message notifies the other participant, and only them.
-- ===================================================================
insert into public.messages (conversation_id, sender_id, body)
values ('55500000-0000-4000-8000-00000000000a',
        '55500000-0000-4000-8000-000000000001', 'Are you free on Thursday?');

do $$
declare n integer; row record;
begin
  select count(*) into n from public.notifications
  where user_id = '55500000-0000-4000-8000-000000000002' and kind = 'message';
  if n <> 1 then
    raise exception 'FAIL 1a: expected one notification for the recipient, found %', n;
  end if;
  raise notice 'ok 1a: a message notifies the person it was sent to';

  select count(*) into n from public.notifications
  where user_id = '55500000-0000-4000-8000-000000000001';
  if n <> 0 then
    raise exception 'FAIL 1b: the sender was notified of their own message';
  end if;
  raise notice 'ok 1b: and not the person who wrote it';

  select count(*) into n from public.notifications
  where user_id = '55500000-0000-4000-8000-000000000003';
  if n <> 0 then
    raise exception 'FAIL 1c: somebody outside the conversation was notified';
  end if;
  raise notice 'ok 1c: and nobody outside the conversation';

  select title, body, href, entity_type, entity_id into row
  from public.notifications
  where user_id = '55500000-0000-4000-8000-000000000002';

  if row.title <> 'Meaza Bekele' then
    raise exception 'FAIL 1d: the notification is titled %, not the sender', row.title;
  end if;
  if row.body <> 'Are you free on Thursday?' then
    raise exception 'FAIL 1e: the preview is %', row.body;
  end if;
  if row.href <> '/messages/55500000-0000-4000-8000-00000000000a' then
    raise exception 'FAIL 1f: clicking it goes to %', row.href;
  end if;
  if row.entity_type <> 'conversation'
     or row.entity_id <> '55500000-0000-4000-8000-00000000000a' then
    raise exception 'FAIL 1g: it does not say what it is about';
  end if;
  raise notice 'ok 1d-g: it names the sender, previews the message, and opens the thread';
end;
$$;

-- ===================================================================
-- 2. Five messages are one notification, not five.
-- ===================================================================
insert into public.messages (conversation_id, sender_id, body) values
  ('55500000-0000-4000-8000-00000000000a', '55500000-0000-4000-8000-000000000001', 'Or Friday'),
  ('55500000-0000-4000-8000-00000000000a', '55500000-0000-4000-8000-000000000001', 'Either works'),
  ('55500000-0000-4000-8000-00000000000a', '55500000-0000-4000-8000-000000000001', 'Let me know');

do $$
declare n integer; latest text;
begin
  select count(*) into n from public.notifications
  where user_id = '55500000-0000-4000-8000-000000000002' and read_at is null;
  if n <> 1 then
    raise exception 'FAIL 2a: four messages produced % tray entries', n;
  end if;
  raise notice 'ok 2a: a burst of messages is one entry, not one each';

  select body into latest from public.notifications
  where user_id = '55500000-0000-4000-8000-000000000002' and read_at is null;
  if latest <> 'Let me know' then
    raise exception 'FAIL 2b: the entry still previews %, not the newest message', latest;
  end if;
  raise notice 'ok 2b: and it previews the newest message';
end;
$$;

-- ===================================================================
-- 3. An attachment with no text still says something.
-- ===================================================================
insert into public.conversations (id, kind, created_by)
values ('55500000-0000-4000-8000-00000000000b', 'direct',
        '55500000-0000-4000-8000-000000000001');
insert into public.conversation_participants (conversation_id, user_id) values
  ('55500000-0000-4000-8000-00000000000b', '55500000-0000-4000-8000-000000000001'),
  ('55500000-0000-4000-8000-00000000000b', '55500000-0000-4000-8000-000000000002');
insert into public.messages (conversation_id, sender_id, body)
values ('55500000-0000-4000-8000-00000000000b',
        '55500000-0000-4000-8000-000000000001', '   ');

do $$
declare preview text;
begin
  select body into preview from public.notifications
  where user_id = '55500000-0000-4000-8000-000000000002'
    and entity_id = '55500000-0000-4000-8000-00000000000b';
  if preview <> 'Sent an attachment' then
    raise exception 'FAIL 3: a message with no text previews as %', coalesce(preview, 'null');
  end if;
  raise notice 'ok 3: a message with no text does not preview as a blank line';
end;
$$;

-- ===================================================================
-- 4. Reading the conversation clears the bell as well as the badge.
-- ===================================================================
set role authenticated;
set local request.jwt.claim.sub = '55500000-0000-4000-8000-000000000002';

do $$
declare n integer; watermark timestamptz;
begin
  perform public.mark_conversation_read('55500000-0000-4000-8000-00000000000a');

  select count(*) into n from public.notifications
  where user_id = '55500000-0000-4000-8000-000000000002'
    and entity_id = '55500000-0000-4000-8000-00000000000a'
    and read_at is null;
  if n <> 0 then
    raise exception 'FAIL 4a: opening the thread left % unread tray entries', n;
  end if;
  raise notice 'ok 4a: opening the conversation clears its tray entry';

  select last_read_at into watermark from public.conversation_participants
  where conversation_id = '55500000-0000-4000-8000-00000000000a'
    and user_id = '55500000-0000-4000-8000-000000000002';
  if watermark <= 'epoch'::timestamptz then
    raise exception 'FAIL 4b: the read watermark did not move';
  end if;
  raise notice 'ok 4b: and moves the read watermark the message badge counts';

  select count(*) into n from public.notifications
  where user_id = '55500000-0000-4000-8000-000000000002'
    and entity_id = '55500000-0000-4000-8000-00000000000b'
    and read_at is null;
  if n <> 1 then
    raise exception 'FAIL 4c: reading one conversation cleared another';
  end if;
  raise notice 'ok 4c: and leaves the other conversation alone';
end;
$$;

-- A conversation that has been read and then written to again is news again.
reset role;
insert into public.messages (conversation_id, sender_id, body)
values ('55500000-0000-4000-8000-00000000000a',
        '55500000-0000-4000-8000-000000000001', 'Still on for Thursday?');

do $$
declare n integer;
begin
  select count(*) into n from public.notifications
  where user_id = '55500000-0000-4000-8000-000000000002'
    and entity_id = '55500000-0000-4000-8000-00000000000a'
    and read_at is null;
  if n <> 1 then
    raise exception 'FAIL 4d: a new message after reading produced % entries', n;
  end if;
  raise notice 'ok 4d: a message after reading starts a fresh entry';

  select count(*) into n from public.notifications
  where user_id = '55500000-0000-4000-8000-000000000002'
    and entity_id = '55500000-0000-4000-8000-00000000000a';
  if n <> 2 then
    raise exception 'FAIL 4e: expected the read one to be kept as history, found % rows', n;
  end if;
  raise notice 'ok 4e: and the read one is kept rather than overwritten';
end;
$$;

-- ===================================================================
-- 5. A notification belongs to one person.
--
-- The target id is captured here, as superuser, and handed to the outsider.
-- Letting the outsider find it with `select id from notifications limit 1`
-- proved nothing: row-level security hides every row from them, so the id was
-- null, `mark_notification_read(null)` matched nothing whatever the function
-- said, and deleting the ownership check from either helper went unnoticed.
-- ===================================================================
reset role;
create temporary table probe_target on commit drop as
select id from public.notifications
where user_id = '55500000-0000-4000-8000-000000000002'
  and read_at is null
limit 1;
grant select on probe_target to authenticated;

set role authenticated;
set local request.jwt.claim.sub = '55500000-0000-4000-8000-000000000003';

do $$
declare n integer; target uuid;
begin
  select id into target from probe_target;

  select count(*) into n from public.notifications;
  if n <> 0 then
    raise exception 'FAIL 5a: an outsider can read % notifications', n;
  end if;
  raise notice 'ok 5a: somebody else''s notifications are not readable';

  perform public.mark_notification_read(target);
  perform public.delete_notification(target);
  raise notice 'ok 5b: and the helpers accept the call without complaint';
end;
$$;

-- Checked as superuser, because the outsider cannot see the row either way and
-- "I cannot see it" is not the same statement as "it is untouched".
reset role;
do $$
declare n integer; target uuid;
begin
  select id into target from probe_target;

  select count(*) into n from public.notifications
  where id = target and read_at is null;
  if n <> 1 then
    raise exception 'FAIL 5c: an outsider marked somebody else''s notification read';
  end if;
  raise notice 'ok 5c: but marking it read from outside changed nothing';

  select count(*) into n from public.notifications where id = target;
  if n <> 1 then
    raise exception 'FAIL 5d: an outsider deleted somebody else''s notification';
  end if;
  raise notice 'ok 5d: and neither did deleting it';
end;
$$;

set role authenticated;
set local request.jwt.claim.sub = '55500000-0000-4000-8000-000000000002';
do $$
declare target uuid; n integer;
begin
  select id into target from probe_target;

  perform public.mark_notification_read(target);
  select count(*) into n from public.notifications
  where id = target and read_at is not null;
  if n <> 1 then
    raise exception 'FAIL 5e: the owner could not mark their own notification read';
  end if;
  raise notice 'ok 5e: the owner can mark their own read';

  perform public.delete_notification(target);
  select count(*) into n from public.notifications where id = target;
  if n <> 0 then
    raise exception 'FAIL 5f: the owner could not delete their own notification';
  end if;
  raise notice 'ok 5f: and delete it';
end;
$$;

-- ===================================================================
-- 6. Neither helper is open to a signed-out visitor.
-- ===================================================================
reset role;
do $$
begin
  if has_function_privilege('anon', 'public.mark_notification_read(uuid)', 'execute')
     or has_function_privilege('anon', 'public.delete_notification(uuid)', 'execute')
  then
    raise exception 'FAIL 6: a signed-out visitor may call the tray helpers';
  end if;
  raise notice 'ok 6: the tray helpers are closed to a signed-out visitor';
end;
$$;

rollback;
