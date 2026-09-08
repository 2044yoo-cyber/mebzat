-- ---------------------------------------------------------------------------
-- Company profiles: numbers that are actually true
-- ---------------------------------------------------------------------------
--
-- Three columns on `companies` are rendered on the business page as facts and
-- nothing has ever written any of them.
--
--   rating             declared in 0006, never set. 0011 says outright that
--                      companies "read their aggregate through review_summary()
--                      instead of carrying a column" — but the column is there,
--                      the page reads it, and it goes into the page's
--                      schema.org `aggregateRating`. A rating published to
--                      search engines that no set of reviews produced.
--   followers_count    displayed as "Followers". Always 0, however many people
--                      have followed.
--   projects_completed displayed as "Projects". Always 0.
--
-- `berchuma_workshops()` sorts its recommendations by the first two of those,
-- so two of its tie-breakers have never done anything.
--
-- The first two are fixable and fixed here. The third is not: `projects` has an
-- `owner_id` and no company link, so there is nothing to count. It is left
-- alone in the database and taken off the page rather than shown as a zero
-- that means "we never implemented this".

-- ---------------------------------------------------------------------------
-- Ratings
-- ---------------------------------------------------------------------------

alter table public.companies
  add column if not exists review_count integer not null default 0;

comment on column public.companies.rating is
  'Recomputed from reviews by refresh_review_aggregates(). Null until the first review.';

-- Extends the existing trigger function rather than adding a second one. Two
-- functions writing the same aggregate is two answers, and the reason this
-- recomputes from the reviews rather than adjusting a counter is the same
-- reason 0011 gave: an edited or deleted review must not be able to leave an
-- average that no set of reviews would produce.
create or replace function public.refresh_review_aggregates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  subject public.review_subject := coalesce(new.subject_type, old.subject_type);
  subject_uuid uuid := coalesce(new.subject_id, old.subject_id);
  avg_rating numeric(3, 2);
  total integer;
begin
  select round(coalesce(avg(rating), 0), 2), count(*)
  into avg_rating, total
  from public.reviews
  where subject_type = subject and subject_id = subject_uuid;

  if subject = 'service' then
    update public.services
    set rating = avg_rating, review_count = total
    where id = subject_uuid;
  elsif subject = 'equipment' then
    update public.equipment
    set rating = avg_rating, review_count = total
    where id = subject_uuid;
  elsif subject = 'company' then
    -- Null rather than zero when there are none, so "no reviews yet" and
    -- "reviewed, and the average is nought" stay distinguishable. The check
    -- constraint on the column permits null; a directory listing nobody has
    -- reviewed is the common case.
    update public.companies
    set rating = case when total = 0 then null else avg_rating end,
        review_count = total
    where id = subject_uuid;
  end if;
  -- Professionals, products and projects still read their aggregate through
  -- review_summary(), which needs no column.

  return coalesce(new, old);
end;
$$;

-- Whatever is in the columns now was never computed from anything, so reviews
-- and follows that predate this migration have to be counted once or every
-- company keeps the number it was imported with.
--
-- A function rather than inline DML for two reasons: a repair that can only be
-- run by replaying a migration is a repair nobody runs, and a backfill that
-- exists only inside a migration cannot be tested — the data it is meant to
-- correct has to be in place before it executes, which is precisely the
-- arrangement a test cannot reach from the other side.
create or replace function public.refresh_company_aggregates()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Four separate statements, not four data-modifying CTEs in one. All four
  -- update `companies`, and inside a single statement a row can only be
  -- updated once — the later CTEs see the pre-statement snapshot and their
  -- changes are silently dropped. Written that way first, and the follower
  -- counts came back untouched while the ratings were correct.
  update public.companies c
  set rating = sub.avg_rating,
      review_count = sub.total
  from (
    select r.subject_id,
           round(avg(r.rating), 2) as avg_rating,
           count(*)::integer as total
    from public.reviews r
    where r.subject_type = 'company'
    group by r.subject_id
  ) sub
  where c.id = sub.subject_id
    and (c.rating is distinct from sub.avg_rating or c.review_count <> sub.total);

  -- A company with no reviews must not keep an imported rating.
  update public.companies c
  set rating = null, review_count = 0
  where (c.rating is not null or c.review_count <> 0)
    and not exists (
      select 1 from public.reviews r
      where r.subject_type = 'company' and r.subject_id = c.id
    );

  update public.companies c
  set followers_count = sub.total
  from (
    select f.target_id, count(*)::integer as total
    from public.follows f
    where f.target_type = 'company'
    group by f.target_id
  ) sub
  where c.id = sub.target_id and c.followers_count <> sub.total;

  update public.companies c
  set followers_count = 0
  where c.followers_count <> 0
    and not exists (
      select 1 from public.follows f
      where f.target_type = 'company' and f.target_id = c.id
    );
end;
$$;

revoke all on function public.refresh_company_aggregates() from public;
-- Repair, not routine. The triggers keep these current; this is for after an
-- import, or after a restore that bypassed them.
grant execute on function public.refresh_company_aggregates() to service_role;

-- ---------------------------------------------------------------------------
-- Followers
-- ---------------------------------------------------------------------------

create or replace function public.refresh_company_followers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.target_id, old.target_id);
  kind public.follow_target := coalesce(new.target_type, old.target_type);
begin
  if kind <> 'company' then
    return coalesce(new, old);
  end if;

  update public.companies
  set followers_count = (
    select count(*) from public.follows f
    where f.target_type = 'company' and f.target_id = target
  )
  where id = target;

  return coalesce(new, old);
end;
$$;

drop trigger if exists follows_refresh_company on public.follows;
create trigger follows_refresh_company
  after insert or delete on public.follows
  for each row
  execute function public.refresh_company_followers();

-- Run once, now that both triggers are in place.
select public.refresh_company_aggregates();

-- ---------------------------------------------------------------------------
-- Standing
-- ---------------------------------------------------------------------------

-- The same shape as professional_reputation() in 0071, and for the same
-- reason: a business's standing rests on reviews of the business *and* on
-- reviews of the services it sells, and adding those up in the application
-- gives a number that differs depending on which page asked.
create or replace function public.company_reputation(p_company uuid)
returns table (
  average numeric,
  total bigint,
  five bigint,
  four bigint,
  three bigint,
  two bigint,
  one bigint,
  verified_total bigint,
  service_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select r.rating, r.verified
    from public.reviews r
    where (r.subject_type = 'company' and r.subject_id = p_company)
       or (
         r.subject_type = 'service'
         and r.subject_id in (
           select s.id from public.services s
           where s.company_id = p_company and s.status = 'published'
         )
       )
  )
  select
    round(coalesce(avg(m.rating), 0), 2),
    count(*)::bigint,
    count(*) filter (where m.rating = 5)::bigint,
    count(*) filter (where m.rating = 4)::bigint,
    count(*) filter (where m.rating = 3)::bigint,
    count(*) filter (where m.rating = 2)::bigint,
    count(*) filter (where m.rating = 1)::bigint,
    count(*) filter (where m.verified)::bigint,
    (
      select count(*)::bigint from public.services s
      where s.company_id = p_company and s.status = 'published'
    )
  from mine m;
$$;

revoke all on function public.company_reputation(uuid) from public;
grant execute on function public.company_reputation(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The recommendation sort
-- ---------------------------------------------------------------------------

-- Unchanged except that its last two tie-breakers now sort by something. The
-- `projects_completed` term is dropped: it has never been populated and never
-- can be from the tables that exist, so it was ordering every row by the same
-- zero.
create or replace function public.berchuma_workshops(
  p_city text default null,
  p_limit integer default 12
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
    -- Between two unrated workshops, the one people have actually reviewed
    -- comes first.
    c.review_count desc
  limit least(greatest(p_limit, 1), 50);
$$;

grant execute on function public.berchuma_workshops(text, integer)
  to anon, authenticated;
