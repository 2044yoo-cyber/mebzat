-- Agenda's four oldest helpers are still callable by a signed-out visitor.
--
-- 0024 revoked them `from public` and granted `execute` to `authenticated`,
-- which reads as closed and is not. Supabase ships
-- `alter default privileges in schema public grant execute on functions to
-- anon`, so `anon` holds a grant of its own that a revoke from `public` does
-- not touch. The same mistake was found and fixed twice already — 0086 for
-- the saved-documents function, 0091 for `agenda_can_view_contracts`, both of
-- which say `from public, anon`. These four were missed.
--
-- ## What it was worth
--
-- Not much, which is why it survived: all four are `security definer` and
-- decide on `auth.uid()`, which is null for `anon`, so an anonymous caller
-- gets `false` and learns nothing. But "it happens to return false" is not a
-- permission, and it is one `or` away from being one.
--
-- ## Why revoking is safe
--
-- A policy's function call runs as the querying role, so removing `execute`
-- from `anon` would break any policy `anon` can match that calls one of
-- these. Every policy in 0024, 0089, 0090 and 0091 that does is `to
-- authenticated`, and a signed-out visitor matches none of them — the query
-- returns no rows without the function ever being reached.
--
-- The new money screens call `agenda_can_view_finance` directly, to say "this
-- is not shared with you" rather than "nothing here yet". That makes these
-- grants something a person's browser reaches rather than only a policy, and
-- is the reason the gap was noticed now.

begin;

do $$
declare fn text;
begin
  foreach fn in array array[
    'agenda_is_member(uuid)',
    'agenda_is_owner(uuid)',
    'agenda_can_view_finance(uuid)',
    'agenda_can_view_meetings(uuid)'
  ] loop
    -- `public, anon` together: the first is the grant 0024 removed, the
    -- second is the one Supabase's default privileges keep handing back.
    execute format('revoke all on function public.%s from public, anon', fn);

    -- Redundant, and deliberately kept. 0024 granted `authenticated` an
    -- explicit `execute`, and revoking from `public` and `anon` does not
    -- touch it — so no test can tell this line apart from its absence, and
    -- mutation testing said exactly that. It stays because a migration that
    -- narrows a grant should state the grant it means to leave behind, and
    -- because the next person to copy this block will not have 0024 open.
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end
$$;

commit;
