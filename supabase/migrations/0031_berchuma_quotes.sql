-- Berchuma Studio — asking a workshop for a quote.
--
-- Phase 4 needed almost no new database code because every write belonged to
-- the person making it. This one does not: sending a request notifies somebody
-- else, and `notifications` has no insert policy at all — reading and marking
-- read are the only things a member may do to that table. That is the correct
-- design (a client that can write notifications can write them to anyone), and
-- it means the one operation that must reach another person has to be a
-- security-definer function.

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------
--
-- The Supabase SQL editor does not wrap a pasted file in a transaction, so a
-- migration that fails halfway leaves half of itself behind and the next one
-- fails on a missing object with no hint about which file is actually absent.
-- "relation public.manufacturing_requests does not exist" reads like a bug in
-- this file; it means 0029 never finished.
--
-- Run supabase/tests/berchuma-doctor.sql to see exactly what is present.
-- ---------------------------------------------------------------------------
-- All of this file, or none of it.
-- ---------------------------------------------------------------------------
--
-- The Supabase SQL editor does not stop at the first error — it runs every
-- statement in what you pasted and reports the failures afterwards. A file
-- that fails halfway therefore leaves half of itself behind, and the next
-- migration fails on a missing object with no hint about which file is
-- actually absent. That is how a database ends up with `designs` but not
-- `manufacturing_requests`.
--
-- An explicit transaction fixes it properly: the first error aborts, every
-- later statement is refused, and nothing is committed. Re-running after the
-- cause is fixed then starts from a clean state rather than from a mess.
--
-- PostgreSQL runs DDL inside transactions, so this is safe for every statement
-- below. It is not safe for `alter type ... add value`, which is why the enum
-- additions live in 0028 and are not wrapped.
begin;

do $$
begin
  if to_regclass('public.manufacturing_requests') is null then
    raise exception using
      message = 'Berchuma: public.manufacturing_requests does not exist, so quote requests cannot be created.',
      hint = 'Apply 0028_berchuma_enums.sql and then 0029_berchuma.sql first, then run this file again. Run supabase/tests/berchuma-doctor.sql to see what is missing.';
  end if;

  if to_regclass('public.companies') is null then
    raise exception using
      message = 'Berchuma: public.companies does not exist, so the workshop directory cannot be created.',
      hint = 'Apply the earlier Medosha migrations first, then run this file again. Run supabase/tests/berchuma-doctor.sql to see what is missing.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- One open request per workshop per design
-- ---------------------------------------------------------------------------
--
-- Asking the same joinery twice for the same wardrobe is not a second job, it
-- is somebody pressing a button again. Once a request has been quoted,
-- accepted or cancelled, a new one is a genuinely new conversation and is
-- allowed — hence the predicate on `requested` rather than a blanket rule.
create unique index if not exists manufacturing_requests_one_open
  on public.manufacturing_requests (design_id, maker_company_id)
  where status = 'requested' and maker_company_id is not null;

-- ---------------------------------------------------------------------------
-- berchuma_request_quote
-- ---------------------------------------------------------------------------

create or replace function public.berchuma_request_quote(
  p_design uuid,
  p_company uuid,
  p_cut_list jsonb,
  p_note text default null,
  p_city text default null,
  p_needed_by date default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  d public.designs%rowtype;
  c public.companies%rowtype;
  request_id uuid;
begin
  if uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into d from public.designs where id = p_design;
  if not found then
    raise exception 'design not found' using errcode = 'P0002';
  end if;

  -- This function is security definer, so the read policy that would normally
  -- have hidden the row never ran. Somebody else's private design must not
  -- become quotable by guessing its id.
  if d.visibility = 'private' and d.owner_id <> uid then
    raise exception 'design not found' using errcode = 'P0002';
  end if;

  select * into c from public.companies where id = p_company;
  if not found then
    raise exception 'workshop not found' using errcode = 'P0002';
  end if;

  insert into public.manufacturing_requests (
    design_id, requester_id, maker_id, maker_company_id,
    status, cut_list, note, city, needed_by
  )
  values (
    d.id, uid, c.owner_id, c.id,
    'requested',
    -- Frozen deliberately. The design may be edited tomorrow, and the shop
    -- must build what was agreed rather than whatever the spec says then.
    p_cut_list,
    left(coalesce(p_note, ''), 2000),
    coalesce(nullif(trim(p_city), ''), c.city),
    p_needed_by
  )
  -- The index above turns a double press into a no-op rather than a second
  -- job on somebody's list.
  on conflict do nothing
  returning id into request_id;

  if request_id is null then
    -- Already asked. Hand back the request that exists so the caller can show
    -- it, rather than reporting a failure for something that has succeeded.
    select id into request_id
    from public.manufacturing_requests
    where design_id = d.id
      and maker_company_id = c.id
      and status = 'requested'
    limit 1;

    return request_id;
  end if;

  -- The workshop hears about it. Only when the company has been claimed —
  -- an unclaimed directory entry has no owner to tell, and the request still
  -- stands so it is waiting when somebody claims it.
  if c.owner_id is not null and c.owner_id <> uid then
    insert into public.notifications (user_id, actor_id, kind, title, body, href)
    values (
      c.owner_id,
      uid,
      'design_order',
      'A quote request for a design',
      d.title,
      '/designs/' || d.slug || '/cut-list'
    );
  end if;

  return request_id;
end;
$$;

comment on function public.berchuma_request_quote(uuid, uuid, jsonb, text, text, date) is
  'Sends a design to a workshop for a quote, freezing the cut list and notifying the workshop. Security definer because notifications has no insert policy — by design.';

grant execute on function
  public.berchuma_request_quote(uuid, uuid, jsonb, text, text, date)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Workshops that can be asked
-- ---------------------------------------------------------------------------
--
-- A function rather than a query in the application, so "what counts as a
-- joinery" is answered in one place. Categories in the directory are free
-- text and were imported from several sources, so this matches on words
-- rather than on an exact value.
create or replace function public.berchuma_workshops(
  p_city text default null,
  p_limit integer default 20
)
returns table (
  id uuid,
  slug text,
  name text,
  city text,
  logo_url text,
  verified boolean,
  rating numeric,
  projects_completed integer,
  is_claimed boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    c.id, c.slug, c.name, c.city, c.logo_url, c.verified,
    c.rating, c.projects_completed, c.is_claimed
  from public.companies c
  where c.category ilike any (array[
    '%joinery%', '%furniture%', '%carpent%', '%cabinet%', '%woodwork%',
    '%interior%', '%fit-out%', '%fitout%'
  ])
  order by
    -- A claimed, verified workshop in the right city will actually answer.
    (p_city is not null and c.city ilike p_city) desc,
    c.is_claimed desc,
    c.verified desc,
    coalesce(c.rating, 0) desc,
    c.projects_completed desc
  limit least(greatest(p_limit, 1), 50);
$$;

grant execute on function public.berchuma_workshops(text, integer)
  to anon, authenticated;

commit;
