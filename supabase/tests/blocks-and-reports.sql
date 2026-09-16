-- A block stops the message. It does not hide it after it arrives.
--
-- Run after applying 0088. Prints one line per check and rolls itself back.
-- Everything is exercised as `authenticated` with a jwt subject: a superuser
-- bypasses row-level security, and the whole subject here is a policy.

begin;

insert into auth.users (id, email) values
  ('44400000-0000-4000-8000-000000000001', 'blocker@example.test'),
  ('44400000-0000-4000-8000-000000000002', 'pest@example.test'),
  ('44400000-0000-4000-8000-000000000003', 'bystander@example.test')
on conflict (id) do nothing;

update public.profiles set username = 'probe_blocker', full_name = 'Selam Tadesse'
where id = '44400000-0000-4000-8000-000000000001';
update public.profiles set username = 'probe_pest', full_name = 'Persistent Person'
where id = '44400000-0000-4000-8000-000000000002';
update public.profiles set username = 'probe_bystander', full_name = 'Uninvolved'
where id = '44400000-0000-4000-8000-000000000003';

insert into public.conversations (id, kind, created_by)
values ('44400000-0000-4000-8000-00000000000a', 'direct',
        '44400000-0000-4000-8000-000000000002');
insert into public.conversation_participants (conversation_id, user_id) values
  ('44400000-0000-4000-8000-00000000000a', '44400000-0000-4000-8000-000000000001'),
  ('44400000-0000-4000-8000-00000000000a', '44400000-0000-4000-8000-000000000002');

set role authenticated;

-- ===================================================================
-- 1. Before the block, the conversation works.
-- ===================================================================
set local request.jwt.claim.sub = '44400000-0000-4000-8000-000000000002';
do $$
begin
  insert into public.messages (conversation_id, sender_id, body)
  values ('44400000-0000-4000-8000-00000000000a',
          '44400000-0000-4000-8000-000000000002', 'Hello again');
  raise notice 'ok 1: an unblocked participant can write';
end;
$$;

-- ===================================================================
-- 2. The block stops the next one being written at all.
-- ===================================================================
set local request.jwt.claim.sub = '44400000-0000-4000-8000-000000000001';
do $$
begin
  perform public.block_user('44400000-0000-4000-8000-000000000002', 'Kept messaging');
  raise notice 'ok 2a: somebody can block somebody';
end;
$$;

set local request.jwt.claim.sub = '44400000-0000-4000-8000-000000000002';
do $$
declare n integer;
begin
  begin
    insert into public.messages (conversation_id, sender_id, body)
    values ('44400000-0000-4000-8000-00000000000a',
            '44400000-0000-4000-8000-000000000002', 'Are you there?');
    raise exception 'FAIL 2b: a blocked sender still wrote into the conversation';
  exception
    when insufficient_privilege then
      raise notice 'ok 2b: a blocked sender is refused at the insert';
  end;

  select count(*) into n from public.messages
  where conversation_id = '44400000-0000-4000-8000-00000000000a';
  if n <> 1 then
    raise exception 'FAIL 2c: expected the one message from before the block, found %', n;
  end if;
  raise notice 'ok 2c: so there is nothing to hide afterwards';
end;
$$;

-- ===================================================================
-- 3. The block runs one way, and is not readable by the person blocked.
-- ===================================================================
do $$
declare n integer;
begin
  select count(*) into n from public.user_blocks;
  if n <> 0 then
    raise exception 'FAIL 3a: the blocked person can see they were blocked';
  end if;
  raise notice 'ok 3a: the blocked person cannot read the block';
end;
$$;

set local request.jwt.claim.sub = '44400000-0000-4000-8000-000000000001';
do $$
declare n integer;
begin
  -- The person who did the blocking can still write to them. Blocking is
  -- "I do not want to hear from you", not "neither of us may speak".
  insert into public.messages (conversation_id, sender_id, body)
  values ('44400000-0000-4000-8000-00000000000a',
          '44400000-0000-4000-8000-000000000001', 'Please stop');
  raise notice 'ok 3b: but the person who blocked them can still write';

  select count(*) into n from public.user_blocks;
  if n <> 1 then
    raise exception 'FAIL 3c: the blocker cannot read their own list';
  end if;
  raise notice 'ok 3c: and can read their own list';
end;
$$;

-- ===================================================================
-- 4. Nobody else is affected.
-- ===================================================================
reset role;
insert into public.conversations (id, kind, created_by)
values ('44400000-0000-4000-8000-00000000000b', 'direct',
        '44400000-0000-4000-8000-000000000002');
insert into public.conversation_participants (conversation_id, user_id) values
  ('44400000-0000-4000-8000-00000000000b', '44400000-0000-4000-8000-000000000002'),
  ('44400000-0000-4000-8000-00000000000b', '44400000-0000-4000-8000-000000000003');
set role authenticated;

set local request.jwt.claim.sub = '44400000-0000-4000-8000-000000000002';
do $$
begin
  insert into public.messages (conversation_id, sender_id, body)
  values ('44400000-0000-4000-8000-00000000000b',
          '44400000-0000-4000-8000-000000000002', 'Hello');
  raise notice 'ok 4: being blocked by one person does not silence the account';
end;
$$;

-- ===================================================================
-- 4b. Somebody who is not in the conversation cannot write into it.
--
-- Not about blocking, and here because the block check was added to the same
-- policy as the participant check — deleting the older half has to fail too,
-- or a mutation that removes it reads as caught by nothing.
-- ===================================================================
set local request.jwt.claim.sub = '44400000-0000-4000-8000-000000000003';
do $$
begin
  begin
    insert into public.messages (conversation_id, sender_id, body)
    values ('44400000-0000-4000-8000-00000000000a',
            '44400000-0000-4000-8000-000000000003', 'Butting in');
    raise exception 'FAIL 4b: a non-participant wrote into somebody else''s thread';
  exception
    when insufficient_privilege then
      raise notice 'ok 4b: a non-participant cannot write into a thread';
  end;
end;
$$;

-- ===================================================================
-- 5. Blocking clears what they had already sent to the bell.
-- ===================================================================
reset role;
do $$
declare n integer;
begin
  select count(*) into n from public.notifications
  where user_id = '44400000-0000-4000-8000-000000000001'
    and actor_id = '44400000-0000-4000-8000-000000000002'
    and read_at is null;
  if n <> 0 then
    raise exception 'FAIL 5: blocking left % unread entries from them', n;
  end if;
  raise notice 'ok 5: blocking clears what they had already sent to the bell';
end;
$$;

-- ===================================================================
-- 6. Unblocking lets them back in.
-- ===================================================================
set role authenticated;
-- A second person blocks the same account, so unblocking has something to be
-- wrong about. With one block on the table, an unblock that forgets whose it
-- is looks identical to one that does not.
reset role;
insert into public.user_blocks (blocker_id, blocked_id)
values ('44400000-0000-4000-8000-000000000003',
        '44400000-0000-4000-8000-000000000002');
set role authenticated;

set local request.jwt.claim.sub = '44400000-0000-4000-8000-000000000001';
do $$
begin
  perform public.unblock_user('44400000-0000-4000-8000-000000000002');
  raise notice 'ok 6a: somebody can unblock somebody';
end;
$$;

reset role;
do $$
declare n integer;
begin
  select count(*) into n from public.user_blocks
  where blocker_id = '44400000-0000-4000-8000-000000000003'
    and blocked_id = '44400000-0000-4000-8000-000000000002';
  if n <> 1 then
    raise exception 'FAIL 6a2: one person unblocking lifted somebody else''s block';
  end if;
  raise notice 'ok 6a2: and only their own';
end;
$$;
set role authenticated;

set local request.jwt.claim.sub = '44400000-0000-4000-8000-000000000002';
do $$
begin
  insert into public.messages (conversation_id, sender_id, body)
  values ('44400000-0000-4000-8000-00000000000a',
          '44400000-0000-4000-8000-000000000002', 'Sorry about that');
  raise notice 'ok 6b: and they can write again';
end;
$$;

-- ===================================================================
-- 7. Blocking yourself is refused.
-- ===================================================================
do $$
begin
  begin
    perform public.block_user('44400000-0000-4000-8000-000000000002');
    raise exception 'FAIL 7: somebody blocked themselves out of their own conversations';
  exception
    when check_violation then
      -- The message, not just the error class. `user_blocks_not_self` would
      -- raise `check_violation` too, so catching the class alone passes with
      -- the function's own guard deleted and only the table constraint left —
      -- which works, but gives the reader a constraint name instead of a
      -- sentence.
      if sqlerrm not like '%cannot block yourself%' then
        raise exception 'FAIL 7: refused, but by the table rather than by the function: %', sqlerrm;
      end if;
      raise notice 'ok 7: blocking yourself is refused, in words';
  end;
end;
$$;

-- ===================================================================
-- 8. Reporting goes into the queue moderators already read.
-- ===================================================================
set local request.jwt.claim.sub = '44400000-0000-4000-8000-000000000001';
do $$
declare item uuid; again uuid; n integer;
begin
  item := public.report_user('44400000-0000-4000-8000-000000000002',
                             'harassment', 'Would not stop messaging');
  if item is null then
    raise exception 'FAIL 8a: reporting produced no moderation item';
  end if;
  raise notice 'ok 8a: reporting somebody creates an item in the moderation queue';

  -- Pressing Report twice is not an error, and does not create a second item.
  again := public.report_user('44400000-0000-4000-8000-000000000002', 'harassment');
  if again <> item then
    raise exception 'FAIL 8b: a second report created a second item';
  end if;
  raise notice 'ok 8b: reporting twice does not create a second item';
end;
$$;

reset role;
do $$
declare n integer; kind text;
begin
  select count(*) into n from public.moderation_reports r
  join public.moderation_items i on i.id = r.item_id
  where i.content_id = '44400000-0000-4000-8000-000000000002';
  if n <> 1 then
    raise exception 'FAIL 8c: expected one report on file, found %', n;
  end if;
  raise notice 'ok 8c: and one report is recorded, not two';

  select content_type::text into kind from public.moderation_items
  where content_id = '44400000-0000-4000-8000-000000000002';
  if kind <> 'profile' then
    raise exception 'FAIL 8d: a reported person is filed as %, not as a person', kind;
  end if;
  raise notice 'ok 8d: filed as a person rather than as one of their pictures';
end;
$$;

set role authenticated;
set local request.jwt.claim.sub = '44400000-0000-4000-8000-000000000002';
do $$
begin
  begin
    perform public.report_user('44400000-0000-4000-8000-000000000002', 'spam');
    raise exception 'FAIL 8e: somebody reported themselves';
  exception
    when check_violation then
      raise notice 'ok 8e: reporting yourself is refused';
  end;
end;
$$;

-- ===================================================================
-- 9. None of it is open to a signed-out visitor.
-- ===================================================================
reset role;
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.block_user(uuid, text)',
    'public.unblock_user(uuid)',
    'public.report_user(uuid, public.moderation_category, text)',
    'public.is_blocked_by_anyone_in(uuid, uuid)'
  ] loop
    if has_function_privilege('anon', fn, 'execute') then
      raise exception 'FAIL 9: a signed-out visitor may call %', fn;
    end if;
  end loop;
  raise notice 'ok 9: none of the helpers is open to a signed-out visitor';
end;
$$;

rollback;
