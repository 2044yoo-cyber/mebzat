-- ---------------------------------------------------------------------------
-- Finding a person
-- ---------------------------------------------------------------------------
--
-- Medosha can find work (`/hire`), services (`/services`) and businesses
-- (`/companies`). It cannot find a *person*. `global_search` has a
-- professional branch, but it matches names and bios only, ranks by profile
-- views and takes no filters — so somebody looking for "a carpenter in Bole
-- who is free this month and has actually been reviewed" has nowhere to ask.
--
-- The trade is not a column on `profiles` and is not being added as one: a
-- professional's trade is the category of the services they publish, which is
-- already recorded and already maintained. A second copy on the profile would
-- be a second answer that drifts.

create or replace function public.search_professionals(
  p_query text default null,
  -- service_categories.slug
  p_category text default null,
  p_city text default null,
  p_min_rating numeric default null,
  p_verified_only boolean default false,
  p_available_only boolean default false,
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (
  id uuid,
  username text,
  full_name text,
  company_name text,
  avatar_url text,
  account_type public.account_type,
  location_city text,
  years_experience integer,
  phone_verified boolean,
  work_status public.work_status,
  rating numeric,
  review_count bigint,
  verified_reviews bigint,
  service_count bigint,
  trades text[],
  total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select
      least(greatest(coalesce(p_limit, 24), 1), 60) as lim,
      greatest(coalesce(p_offset, 0), 0) as off,
      nullif(btrim(coalesce(p_query, '')), '') as q,
      nullif(btrim(coalesce(p_category, '')), '') as cat,
      nullif(btrim(coalesce(p_city, '')), '') as city
  ),
  -- Every published service, with its category, collapsed to one row per
  -- provider. Computed once rather than per candidate.
  offered as (
    select
      s.provider_id,
      count(*)::bigint as service_count,
      array_agg(distinct sc.name) filter (where sc.name is not null) as trades,
      array_agg(distinct sc.slug) filter (where sc.slug is not null) as slugs
    from public.services s
    left join public.service_categories sc on sc.id = s.category_id
    where s.status = 'published'
    group by s.provider_id
  ),
  -- The same reviews `professional_reputation()` counts, for everybody at
  -- once: those left against the person and those left on the services they
  -- publish.
  standing as (
    select
      subject.provider_id,
      round(avg(r.rating), 2) as rating,
      count(*)::bigint as review_count,
      count(*) filter (where r.verified)::bigint as verified_reviews
    from public.reviews r
    join lateral (
      select case
        when r.subject_type = 'professional' then r.subject_id
        when r.subject_type = 'service' then (
          select s.provider_id from public.services s
          where s.id = r.subject_id and s.status = 'published'
        )
      end as provider_id
    ) subject on subject.provider_id is not null
    where r.subject_type in ('professional', 'service')
    group by subject.provider_id
  ),
  matched as (
    select
      p.id,
      p.username,
      p.full_name,
      p.company_name,
      p.avatar_url,
      p.account_type,
      p.location_city,
      p.years_experience,
      p.phone_verified,
      p.work_status,
      st.rating,
      coalesce(st.review_count, 0) as review_count,
      coalesce(st.verified_reviews, 0) as verified_reviews,
      coalesce(o.service_count, 0) as service_count,
      coalesce(o.trades, array[]::text[]) as trades,
      p.reputation_points,
      p.profile_views
    from public.profiles p
    cross join bounds b
    left join offered o on o.provider_id = p.id
    left join standing st on st.provider_id = p.id
    where
      -- No username, no public page to send anybody to.
      p.username is not null
      -- A restricted account is one a moderator has taken action against.
      -- Recommending it to somebody about to hand over money is the one thing
      -- this must not do.
      and (p.restricted_until is null or p.restricted_until < now())
      and (
        b.q is null
        or p.full_name ilike '%' || b.q || '%'
        or p.company_name ilike '%' || b.q || '%'
        or p.username ilike '%' || b.q || '%'
        or p.bio ilike '%' || b.q || '%'
        or exists (
          select 1 from unnest(coalesce(o.trades, array[]::text[])) t
          where t ilike '%' || b.q || '%'
        )
      )
      and (b.cat is null or b.cat = any (coalesce(o.slugs, array[]::text[])))
      and (b.city is null or p.location_city ilike b.city)
      and (p_min_rating is null or st.rating >= p_min_rating)
      -- "Verified" on Medosha means a confirmed phone code and nothing more,
      -- which is what `phone_verified` records. It is not stretched here to
      -- include anybody who merely typed a number in.
      and (not coalesce(p_verified_only, false) or p.phone_verified)
      and (
        not coalesce(p_available_only, false)
        or p.work_status in ('available', 'limited')
      )
  )
  select
    m.id,
    m.username,
    m.full_name,
    m.company_name,
    m.avatar_url,
    m.account_type,
    m.location_city,
    m.years_experience,
    m.phone_verified,
    m.work_status,
    m.rating,
    m.review_count,
    m.verified_reviews,
    m.service_count,
    m.trades,
    count(*) over ()::bigint as total_count
  from matched m
  cross join bounds b
  order by
    -- Somebody who has been reviewed outranks somebody who has not, whatever
    -- their view count. Ordering by views alone — which is what the global
    -- search does — puts the most looked-at profile first, not the best one.
    (m.review_count > 0) desc,
    m.rating desc nulls last,
    m.verified_reviews desc,
    m.review_count desc,
    m.reputation_points desc,
    m.profile_views desc,
    m.id
  limit (select lim from bounds)
  offset (select off from bounds);
$$;

revoke all on function public.search_professionals(
  text, text, text, numeric, boolean, boolean, integer, integer
) from public;
-- Public first: somebody looking for a carpenter should not need an account to
-- find one.
grant execute on function public.search_professionals(
  text, text, text, numeric, boolean, boolean, integer, integer
) to anon, authenticated;

-- The filters this drives, sorted the way the page lists them.
create index if not exists profiles_location_city_idx
  on public.profiles (location_city)
  where username is not null;
