-- Who belongs in a search for somebody to hire.
--
-- 0097 gave every account a role. This is the first search to read it.
--
-- ## What was wrong
--
-- `search_professionals` asked three things of a candidate: that they have a
-- username, that no moderator has restricted them, and that they are not seed
-- data. Nothing asked whether they were offering to work. So a homeowner who
-- signed up to find a carpenter, filled in their name and their sub-city, and
-- never claimed a trade, appeared in the results for "carpenter in Bole" as a
-- card with a name and nothing else — and somebody rang them about a job.
--
-- ## The rule
--
-- The same one `listsInProfessionalMarketplace` applies in the application:
-- `professional` or `company` is listed, and `client`, `agent` and `seller`
-- are not. Written in both places because both are asked — the function
-- decides what a search returns and the application decides what a card says
-- about it — and supabase/tests/professional-search.sql asserts the function's
-- half so the two cannot drift silently.
--
-- ## What changes for accounts that already exist
--
-- 0097's backfill gave a role to every profile from what it already said, so
-- this is not a new question being asked of anybody. Two groups move:
--
--   * A supplier or manufacturer with no trade filled in became `seller` and
--     no longer appears among professionals. It never had anything to show in
--     one of these results — no trade, no specialties — and the marketplace is
--     where it is found. One with a trade filled in became `professional` and
--     is untouched.
--   * A homeowner became `client` and no longer appears. That is the bug.
--
-- A contractor, consultancy or firm became `company` and stays, whether or not
-- it has named a trade: it said it is a business on a construction platform,
-- which is the claim this search exists to surface.
--
-- ## Why the whole function is restated
--
-- `create or replace` needs the entire body, and the alternative — a wrapper
-- that filters the old function's rows — would filter after the page and the
-- total had already been decided, so page two would come back short and the
-- count would be wrong.
--
-- The only difference from 0078's version is the `roles` clause in the
-- candidate `where`. Everything else is that function, verbatim.

begin;

create or replace function public.search_professionals(
  p_query text default null,
  -- service_categories.slug, the broad grouping. Kept: services are still
  -- categorised that way and the old filter still works.
  p_category text default null,
  -- The trade itself, as a customer says it. "welder".
  p_profession text default null,
  -- Where the job is. A location_areas slug. This is the important one.
  p_area text default null,
  p_city text default 'Addis Ababa',
  -- 'individual' or 'company'. Null is both.
  p_provider text default null,
  p_min_rating numeric default null,
  p_verified_only boolean default false,
  p_available_only boolean default false,
  p_min_experience integer default null,
  -- relevance | rating | nearest | experience
  p_sort text default 'relevance',
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
  base_area text,
  -- Null unless they turned it on. 0071 made `show_phone` default false and
  -- the profile page honours it; a search result that returned the number
  -- anyway would be the same leak through a different door.
  phone text,
  profession text,
  specialties text[],
  years_experience integer,
  phone_verified boolean,
  id_verified boolean,
  business_verified boolean,
  license_verified boolean,
  work_status public.work_status,
  rating numeric,
  review_count bigint,
  verified_reviews bigint,
  service_count bigint,
  trades text[],
  service_areas text[],
  serves_entire_city boolean,
  travel_radius_km integer,
  projects_completed bigint,
  distance_km numeric,
  -- 'area' when they listed it, 'radius' when they will travel to it,
  -- 'city' when they cover the whole city, 'any' when no area was asked for.
  match_kind text,
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
      lower(nullif(btrim(coalesce(p_profession, '')), '')) as prof,
      lower(nullif(btrim(coalesce(p_area, '')), '')) as area,
      coalesce(nullif(btrim(coalesce(p_city, '')), ''), 'Addis Ababa') as city,
      lower(nullif(btrim(coalesce(p_provider, '')), '')) as provider,
      coalesce(nullif(btrim(coalesce(p_sort, '')), ''), 'relevance') as sort
  ),
  -- Where the job is, when one was named. A name that is not in the gazetteer
  -- gives no row, and the area predicate below then matches nothing rather
  -- than silently matching everybody — an unrecognised place must not quietly
  -- widen the search to the whole country.
  job as (
    select a.* from public.location_areas a, bounds b
    where b.area is not null
      and (a.slug = b.area or lower(a.name) = b.area)
      and a.city = b.city
    limit 1
  ),
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
          -- `status = 'published'` matters: without it a review left on a
          -- service its owner later unpublished still counts toward their
          -- rating, which is a way to keep a good score on work nobody can
          -- see. 0073 had this and the first draft of the rewrite dropped it;
          -- supabase/tests/professional-search.sql caught it.
          select s.provider_id from public.services s
          where s.id = r.subject_id and s.status = 'published'
        )
      end as provider_id
    ) subject on subject.provider_id is not null
    where r.subject_type in ('professional', 'service')
    group by subject.provider_id
  ),
  areas as (
    select
      profile_id,
      array_agg(area_name order by area_name) as names,
      array_agg(area_slug) as slugs
    from public.professional_service_areas
    group by profile_id
  ),
  built as (
    select owner_id, count(*)::bigint as n
    from public.projects
    where status = 'published'
    group by owner_id
  ),
  candidates as (
    select
      p.*,
      coalesce(o.service_count, 0) as service_count,
      coalesce(o.trades, '{}'::text[]) as trades,
      coalesce(o.slugs, '{}'::text[]) as slugs,
      st.rating,
      coalesce(st.review_count, 0) as review_count,
      coalesce(st.verified_reviews, 0) as verified_reviews,
      coalesce(ar.names, '{}'::text[]) as service_areas,
      coalesce(ar.slugs, '{}'::text[]) as area_slugs,
      coalesce(bt.n, 0) as projects_completed,
      -- Base coordinates, best available: the pin they set, else the centroid
      -- of the area they named, else the centroid of their city. Only ever
      -- used to measure a radius, never published.
      coalesce(
        p.latitude,
        (select a.latitude from public.location_areas a
          where a.slug = lower(replace(coalesce(p.base_area, ''), ' ', '-')) limit 1),
        (select a.latitude from public.location_areas a
          where lower(a.name) = lower(coalesce(p.location_city, '')) limit 1)
      ) as base_lat,
      coalesce(
        p.longitude,
        (select a.longitude from public.location_areas a
          where a.slug = lower(replace(coalesce(p.base_area, ''), ' ', '-')) limit 1),
        (select a.longitude from public.location_areas a
          where lower(a.name) = lower(coalesce(p.location_city, '')) limit 1)
      ) as base_lon
    from public.profiles p
    left join offered o on o.provider_id = p.id
    left join standing st on st.provider_id = p.id
    left join areas ar on ar.profile_id = p.id
    left join built bt on bt.owner_id = p.id
    where
      -- No username, no public page to send anybody to.
      p.username is not null
      -- A restricted account is one a moderator has taken action against.
      -- Recommending it to somebody about to hand over money is the one thing
      -- this must not do. 0073 had this and the first draft of the rewrite
      -- dropped it; supabase/tests/professional-search.sql caught it.
      and (p.restricted_until is null or p.restricted_until < now())
      and coalesce(p.is_demo, false) = false
      -- 0099. A homeowner who signed up to hire a carpenter is not a
      -- carpenter, and was being offered as one. `roles` is the answer to
      -- "what did you come here to do", and only two of the five answers
      -- belong in a search for somebody to hire.
      --
      -- An empty array is left in rather than excluded: it is an account
      -- part-way through the welcome question, and the rule above has already
      -- required a username, so nothing half-made reaches here anyway.
      and (
        cardinality(p.roles) = 0
        or p.roles && array['professional', 'company']::public.medosha_role[]
      )
  ),
  measured as (
    select
      c.*,
      case
        when j.latitude is null or c.base_lat is null then null
        else round((
          6371 * 2 * asin(sqrt(
            power(sin(radians(j.latitude - c.base_lat) / 2), 2)
            + cos(radians(c.base_lat)) * cos(radians(j.latitude))
              * power(sin(radians(j.longitude - c.base_lon) / 2), 2)
          ))
        )::numeric, 1)
      end as distance_km,
      j.slug as job_slug
    from candidates c
    left join job j on true
  ),
  matched as (
    select
      m.*,
      case
        when (select area from bounds) is null then 'any'
        -- An area was asked for and it is not a place this gazetteer knows.
        -- Nobody matches. Every branch below has to sit behind this: the
        -- whole-city one does not look at the job at all, so without this
        -- guard a misspelling returned every citywide provider in the country
        -- as though they all worked in a place that does not exist.
        when m.job_slug is null then null
        when m.job_slug = any (m.area_slugs) then 'area'
        when m.serves_entire_city
             and lower(coalesce(m.location_city, '')) = lower((select city from bounds))
          then 'city'
        when m.travel_radius_km is not null
             and m.distance_km is not null
             and m.distance_km <= m.travel_radius_km then 'radius'
        else null
      end as match_kind
    from measured m
  ),
  filtered as (
    select * from matched m, bounds b
    where m.match_kind is not null
      -- The trade. Matched against the profession they set, and against the
      -- categories of the services they publish, so somebody who filled in one
      -- and not the other is still findable.
      and (
        b.prof is null
        or lower(coalesce(m.profession, '')) = b.prof
        or b.prof = any (select lower(t) from unnest(m.trades) t)
      )
      and (b.cat is null or b.cat = any (m.slugs))
      and (
        b.q is null
        or m.full_name ilike '%' || b.q || '%'
        or m.company_name ilike '%' || b.q || '%'
        or m.username ilike '%' || b.q || '%'
        or coalesce(m.profession, '') ilike '%' || b.q || '%'
        or m.bio ilike '%' || b.q || '%'
        or exists (select 1 from unnest(m.specialties) s where s ilike '%' || b.q || '%')
        or exists (select 1 from unnest(m.trades) t where t ilike '%' || b.q || '%')
      )
      and (
        b.provider is null
        or (b.provider = 'individual' and coalesce(m.account_type::text, 'individual') = 'individual')
        or (b.provider = 'company' and coalesce(m.account_type::text, '') <> 'individual')
      )
      and (p_min_rating is null or coalesce(m.rating, 0) >= p_min_rating)
      and (p_min_experience is null or coalesce(m.years_experience, 0) >= p_min_experience)
      -- "Verified" means somebody checked a document. A confirmed phone number
      -- is a weaker fact and is shown separately rather than counted here.
      and (
        coalesce(p_verified_only, false) = false
        or m.id_verified or m.business_verified or m.license_verified
      )
      and (
        coalesce(p_available_only, false) = false
        or m.work_status in ('available', 'limited')
      )
  ),
  scored as (
    select
      f.*,
      -- Section 7's order, as weights. Distance is last and small: ranking a
      -- directory purely by proximity buries the good tradesman two areas over
      -- under the indifferent one next door.
      (
        case when lower(coalesce(f.profession, '')) = (select prof from bounds) then 400 else 0 end
        + case f.match_kind
            when 'area' then 300
            when 'radius' then 200
            when 'city' then 100
            else 0
          end
        + case f.work_status
            when 'available' then 120
            when 'limited' then 60
            else 0
          end
        + coalesce(f.rating, 0) * 20
        + case when f.license_verified then 60 else 0 end
        + case when f.business_verified then 40 else 0 end
        + case when f.id_verified then 25 else 0 end
        + case when f.phone_verified then 10 else 0 end
        + least(f.projects_completed, 10) * 6
        + case
            when f.response_minutes is null then 0
            when f.response_minutes <= 60 then 30
            when f.response_minutes <= 240 then 20
            when f.response_minutes <= 1440 then 10
            else 0
          end
        + least(coalesce(f.years_experience, 0), 20) * 2
        - coalesce(f.distance_km, 0) * 0.5
      )::numeric as score
    from filtered f
  ),
  counted as (select count(*)::bigint as n from scored)
  select
    s.id, s.username, s.full_name, s.company_name, s.avatar_url, s.account_type,
    s.location_city, s.base_area,
    case when s.show_phone then s.phone else null end as phone,
    s.profession, s.specialties, s.years_experience,
    s.phone_verified, s.id_verified, s.business_verified, s.license_verified,
    s.work_status, s.rating, s.review_count, s.verified_reviews,
    s.service_count, s.trades, s.service_areas, s.serves_entire_city,
    s.travel_radius_km, s.projects_completed, s.distance_km, s.match_kind,
    (select n from counted) as total_count
  from scored s, bounds b
  order by
    case when b.sort = 'rating' then coalesce(s.rating, 0) end desc nulls last,
    case when b.sort = 'experience' then coalesce(s.years_experience, 0) end desc nulls last,
    case when b.sort = 'nearest' then s.distance_km end asc nulls last,
    case when b.sort not in ('rating', 'experience', 'nearest') then s.score end desc nulls last,
    s.review_count desc,
    s.id
  limit (select lim from bounds)
  offset (select off from bounds);
$$;

grant execute on function public.search_professionals(
  text, text, text, text, text, text, numeric, boolean, boolean, integer, text, integer, integer
) to anon, authenticated;

commit;
