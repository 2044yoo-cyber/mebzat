-- A membership belongs to one person on one project, and a member may only
-- accept it or leave it.
--
-- 0024 lets a member update their own `agenda_members` row, so that they can
-- accept an invitation, and guards that update against changing the role or
-- the confidential permissions. It did not guard the rest of the row, and
-- three things followed, each shown on PostgreSQL in
-- supabase/tests/collab-invites.sql before this file existed:
--
--   * A removed or suspended member could set their own status back to
--     `active` and walk back in.
--   * A row's `project_id` could be changed. Anybody may start a project,
--     which makes them its administrator; that row — administrator, finance,
--     meetings, contracts, approvals — could then be pointed at any other
--     project, making them an administrator of somebody else's Agenda.
--   * A row's `user_id` could be changed, handing a membership to anybody.
--
-- Now: who and which project a membership is for never changes, for anybody.
-- Somebody who is not the project's owner may change their own row in two
-- ways only — accept an invitation (invited → active) and leave (→ removed).
-- The owner, the client and administrators manage the roster as before.
--
-- Safe to run more than once: it replaces one function.

create or replace function public.agenda_guard_member_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- For everybody, owners included: moving a membership between projects or
  -- people is never an edit, it is a new membership, and those are inserted.
  if new.project_id is distinct from old.project_id
     or new.user_id is distinct from old.user_id then
    raise exception 'A membership stays with its person and its project'
      using errcode = 'check_violation';
  end if;

  -- The rest is about what people may do to their own row through the app.
  -- Maintenance — the SQL editor, the service role, a migration — is not a
  -- member acting on their own membership. `role` is the session's role, which
  -- a security-definer function does not change and an app user cannot set.
  if coalesce(current_setting('role', true), 'none') not in ('authenticated', 'anon') then
    return new;
  end if;

  if public.agenda_is_owner(old.project_id) then
    return new;
  end if;

  if new.role is distinct from old.role
     or new.can_view_finance is distinct from old.can_view_finance
     or new.can_view_meetings is distinct from old.can_view_meetings
     or new.can_view_contracts is distinct from old.can_view_contracts
     or new.can_approve is distinct from old.can_approve then
    raise exception 'Only the client or an administrator can change Agenda permissions'
      using errcode = 'insufficient_privilege';
  end if;

  if new.invited_by is distinct from old.invited_by
     or new.invited_at is distinct from old.invited_at then
    raise exception 'Who invited a member, and when, is not theirs to change'
      using errcode = 'insufficient_privilege';
  end if;

  if new.status is distinct from old.status
     and not (old.status = 'invited' and new.status = 'active')
     and not (old.status in ('invited', 'active') and new.status = 'removed') then
    raise exception 'Only the client or an administrator can let a member back in'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;
