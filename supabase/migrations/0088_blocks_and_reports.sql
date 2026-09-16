-- Blocking somebody, and reporting them.
--
-- Neither existed. The brief asks for both on the messaging screen, and the
-- important half is where the block is enforced: a block the database does not
-- know about is a setting that hides the messages it fails to stop. The person
-- blocked still writes, the row still lands, the trigger from 0087 still
-- raises a notification, and the only thing that changed is that the recipient
-- cannot see what is being said to them. So the rule goes in the policy that
-- decides whether a message may be inserted at all.
--
-- ## Reporting reuses the moderation pipeline
--
-- `moderation_items`, `moderation_reports`, `bump_report_count` and the review
-- queue in the control room all exist from 0052 and 0076. A second reporting
-- system for people would mean a second queue for moderators to remember to
-- look at. `content_kind` gains `profile`, and a reported person becomes an
-- item in the queue that is already read every day.

begin;

-- A person is not their avatar. `profile_avatar` and `profile_cover` are about
-- a picture somebody uploaded; this is about conduct.
alter type public.content_kind add value if not exists 'profile';

commit;

begin;

-- ---------------------------------------------------------------------------
-- Blocks
-- ---------------------------------------------------------------------------

create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  -- Blocking yourself would lock you out of every conversation you are in.
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);

comment on table public.user_blocks is
  'Who refuses to hear from whom. Read by the message insert policy, so a block stops the message rather than hiding it after it lands.';

create index if not exists user_blocks_blocked_idx
  on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;

-- Your own list, and nobody else's — including the people on it. Somebody who
-- could read the rows where they are `blocked_id` would learn exactly who has
-- blocked them, which is the one fact a block is supposed to keep quiet.
drop policy if exists "Blockers manage their own list" on public.user_blocks;
create policy "Blockers manage their own list"
  on public.user_blocks for all
  to authenticated
  using (blocker_id = auth.uid())
  with check (blocker_id = auth.uid());

-- ---------------------------------------------------------------------------
-- The block is enforced where a message is written
-- ---------------------------------------------------------------------------
--
-- Replaces the policy from 0007, which checked only that the sender was a
-- participant. `security definer` on the helper, because the sender cannot see
-- the blocker's rows — the policy above is deliberately one-sided — and a
-- check the sender can read is a check the sender can defeat by reading it.

create or replace function public.is_blocked_by_anyone_in(
  target_conversation uuid,
  sender uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_participants cp
    join public.user_blocks b
      on b.blocker_id = cp.user_id
     and b.blocked_id = sender
    where cp.conversation_id = target_conversation
      -- Belt and braces with `user_blocks_not_self`: a self-block cannot
      -- exist, so this changes no outcome today and no test can tell it apart.
      -- It stays because the sentence "somebody else in this conversation has
      -- blocked you" is what the function is for, and a reader should not have
      -- to find a check constraint two hundred lines away to know it is true.
      and cp.user_id <> sender
  );
$$;

revoke all on function public.is_blocked_by_anyone_in(uuid, uuid) from public, anon;
grant execute on function public.is_blocked_by_anyone_in(uuid, uuid) to authenticated;

drop policy if exists "Participants can send messages" on public.messages;
create policy "Participants can send messages"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_conversation_participant(conversation_id, auth.uid())
    and not public.is_blocked_by_anyone_in(conversation_id, auth.uid())
  );

create or replace function public.block_user(target_user uuid, why text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_user = auth.uid() then
    raise exception 'You cannot block yourself.' using errcode = 'check_violation';
  end if;

  insert into public.user_blocks (blocker_id, blocked_id, reason)
  values (auth.uid(), target_user, nullif(btrim(coalesce(why, '')), ''))
  on conflict (blocker_id, blocked_id) do update set reason = excluded.reason;

  -- Their unread entries go with them. Leaving them would keep the bell
  -- pointing at somebody the reader has just said they do not want to hear
  -- from.
  update public.notifications
  set read_at = now()
  where user_id = auth.uid()
    and actor_id = target_user
    and read_at is null;
end;
$$;

create or replace function public.unblock_user(target_user uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.user_blocks
  where blocker_id = auth.uid() and blocked_id = target_user;
$$;

revoke all on function public.block_user(uuid, text) from public, anon;
revoke all on function public.unblock_user(uuid) from public, anon;
grant execute on function public.block_user(uuid, text) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------
--
-- One item per reported person, so ten complaints about one account are ten
-- reports against one item and `report_count` means what it says. 0052's
-- unique constraint on (item_id, reporter_id) already stops one person
-- reporting the same account twice, which is why nothing here counts.

create or replace function public.report_user(
  target_user uuid,
  why public.moderation_category,
  note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Not `item_id`: that is also the name of a column in
  -- `moderation_reports`, and the insert below would not know which was meant.
  found_item uuid;
begin
  if target_user = auth.uid() then
    raise exception 'You cannot report yourself.' using errcode = 'check_violation';
  end if;

  select id into found_item
  from public.moderation_items
  where content_type = 'profile' and content_id = target_user
  limit 1;

  if found_item is null then
    insert into public.moderation_items (content_type, content_id, user_id, status)
    values ('profile', target_user, target_user, 'pending')
    returning id into found_item;
  end if;

  -- `do nothing` rather than an error: somebody pressing Report twice has not
  -- done anything wrong, and a red message telling them so reads as a fault.
  insert into public.moderation_reports (item_id, reporter_id, category, note)
  values (found_item, auth.uid(), why, nullif(btrim(coalesce(note, '')), ''))
  on conflict (item_id, reporter_id) do nothing;

  return found_item;
end;
$$;

revoke all on function public.report_user(uuid, public.moderation_category, text)
  from public, anon;
grant execute on function public.report_user(uuid, public.moderation_category, text)
  to authenticated;

commit;
