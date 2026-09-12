-- A job is somewhere, and the people who should hear about it are the people
-- who work there.
--
-- 0078 gave professionals a list of areas they will travel to and made the
-- directory search read it. `match_professionals` — which decides who gets
-- told about a posted job — still scored locality as
--
--     when s.location_city = b.location_city then 0.15
--
-- so the welder in Bole who works in Summit was as invisible to a Summit job
-- as he had been to a Summit search. Worse: a brief had no way to say
-- "Summit" at all. It had a city, and the only city is the city.
--
-- It also only ever looked at published *service listings*. Somebody who
-- filled in their trade and the areas they work in but never wrote a service
-- listing could not be matched to anything, which is most of the people the
-- Professionals page was just built to find.

-- ---------------------------------------------------------------------------
-- Where the job is, and what it needs
-- ---------------------------------------------------------------------------

alter table public.project_briefs
  -- A location_areas slug. Null on every brief written before this, which is
  -- why the matcher treats null as "no area stated" rather than as no match.
  add column if not exists location_area text,
  -- The trade, in the words the customer used. `category` stays the service
  -- category it files under.
  add column if not exists profession text;

comment on column public.project_briefs.location_area is
  'Where the work is, as a location_areas slug. Matched against what professionals said they cover.';

create index if not exists briefs_area_idx
  on public.project_briefs (location_area)
  where status = 'open';

-- ---------------------------------------------------------------------------
-- Who hears about it
-- ---------------------------------------------------------------------------

-- The return columns are unchanged, so `invite_matching_professionals` and
-- `getMatches` keep working. What changes is the candidate set — professionals
-- rather than service listings — and what locality means.
--
-- One row per professional rather than one per service. The invite table is
-- keyed on (brief_id, professional_id) and deduped on conflict, so a person
-- with three matching services was already only ever invited once; ranking
-- per service just meant two of those rows were computed and thrown away.
--
-- The weights are deliberately visible rather than learned: a client asking
-- "why was this one first" deserves an answer, and a marketplace that cannot
-- explain its own ranking is one nobody trusts.
--
--   category / skills / trade   0.35   is this even the right trade
--   budget fit                  0.20   can they work within the money
--   location                    0.15   will they come to where the job is
--   availability                0.15   can they start
--   rating and history          0.15   are they any good at it
create or replace function public.match_professionals(
  target_brief_id uuid,
  max_results integer default 20
)
returns table (
  service_id uuid,
  provider_id uuid,
  title text,
  score real,
  reason text
)
language sql
stable
security definer
set search_path = public
as $$
  with brief as (
    select * from public.project_briefs where id = target_brief_id
  ),
  job as (
    select a.* from public.location_areas a, brief b
    where b.location_area is not null and a.slug = b.location_area
    limit 1
  ),
  -- The best matching published service per provider, when they have one. A
  -- professional with no service listing still reaches the rest of this query;
  -- they simply score nothing for budget and bring no service id.
  best_service as (
    select distinct on (s.provider_id)
      s.provider_id,
      s.id as service_id,
      s.title,
      s.price_from,
      s.serves_remotely,
      sc.slug as category_slug,
      sc.name as category_name,
      (case
        when lower(sc.slug) = lower(b.category) then 0.35
        when sc.slug = any (b.required_skills) then 0.30
        when b.category ilike '%' || sc.name || '%'
          or s.title ilike '%' || b.category || '%' then 0.22
        else 0
      end)::real as trade
    from brief b
    join public.services s
      on s.status = 'published'
     and s.accepting_work
     and s.provider_id <> b.client_id
    left join public.service_categories sc on sc.id = s.category_id
    order by s.provider_id, trade desc, s.price_from asc nulls last
  ),
  standing as (
    select
      subject.provider_id,
      round(avg(r.rating), 2) as rating,
      count(*)::bigint as review_count
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
  built as (
    select owner_id, count(*)::bigint as n
    from public.projects where status = 'published'
    group by owner_id
  ),
  candidates as (
    select
      p.id as provider_id,
      bs.service_id,
      coalesce(bs.title, p.profession, 'Professional') as title,
      bs.category_name,
      bs.price_from,
      coalesce(bs.serves_remotely, false) as serves_remotely,
      p.profession,
      p.work_status,
      p.travel_radius_km,
      p.serves_entire_city,
      p.location_city,
      p.base_area,
      p.latitude,
      p.longitude,
      coalesce(st.rating, 0) as rating,
      coalesce(bt.n, 0) as projects_completed,
      -- The trade score, from the service's category or from the trade they
      -- set on their profile. Somebody who filled in one and not the other is
      -- still matched.
      greatest(
        coalesce(bs.trade, 0),
        (case
          when p.profession is null or b.profession is null then 0
          when lower(p.profession) = lower(b.profession) then 0.35
          when p.profession ilike '%' || b.profession || '%' then 0.22
          else 0
        end)::real
      ) as trade,
      exists (
        select 1 from public.professional_service_areas a, job j
        where a.profile_id = p.id and a.area_slug = j.slug
      ) as lists_the_area
    from brief b
    join public.profiles p
      on p.username is not null
     and p.id <> b.client_id
     and (p.restricted_until is null or p.restricted_until < now())
     and coalesce(p.is_demo, false) = false
    left join best_service bs on bs.provider_id = p.id
    left join standing st on st.provider_id = p.id
    left join built bt on bt.owner_id = p.id
    where bs.provider_id is not null or p.profession is not null
  ),
  measured as (
    select
      c.*,
      (select slug from job) as job_slug,
      case
        when (select latitude from job) is null then null
        else public.distance_km(
          (select latitude from job), (select longitude from job),
          coalesce(
            c.latitude,
            (select a.latitude from public.location_areas a
              where a.slug = lower(replace(coalesce(c.base_area, ''), ' ', '-')) limit 1)
          ),
          coalesce(
            c.longitude,
            (select a.longitude from public.location_areas a
              where a.slug = lower(replace(coalesce(c.base_area, ''), ' ', '-')) limit 1)
          )
        )
      end as distance_km
    from candidates c
  ),
  covered as (
    select
      m.*,
      case
        -- No area stated. Every brief written before this column existed is
        -- here, so it must not mean "nobody matches".
        when m.job_slug is null then 'unstated'
        when m.lists_the_area then 'area'
        when m.serves_entire_city then 'city'
        when m.travel_radius_km is not null
             and m.distance_km is not null
             and m.distance_km <= m.travel_radius_km then 'radius'
        when m.serves_remotely then 'remote'
        else null
      end as coverage
    from measured m
  ),
  scored as (
    select
      c.*,
      (
        c.trade
        + (case
            when c.price_from is null then 0.10
            when (select budget_max from brief) is null then 0.10
            when c.price_from <= (select budget_max from brief) then 0.20
            when c.price_from <= (select budget_max from brief) * 1.2 then 0.08
            else 0
          end)::real
        -- Locality is now about whether they will come, not about where they
        -- sleep. Saying so outright beats being caught by a radius, which
        -- beats blanket-covering the city.
        + (case c.coverage
            when 'area' then 0.15
            when 'radius' then 0.12
            when 'city' then 0.10
            when 'remote' then 0.10
            else 0.05
          end)::real
        + (case c.work_status
            when 'available' then 0.15
            when 'limited' then 0.10
            when 'busy' then 0.04
            else 0
          end)::real
        + (least(c.rating / 5.0, 1) * 0.10
           + least(c.projects_completed / 20.0, 1) * 0.05)::real
      )::real as total
    from covered c
  )
  select
    s.service_id,
    s.provider_id,
    s.title,
    s.total as score,
    case
      when s.coverage = 'area' then 'Works in the area you named'
      when s.trade >= 0.30 then 'Specialises in ' || coalesce(s.category_name, s.profession, 'this work')
      when s.coverage = 'radius' then 'Travels to the area you named'
      when s.work_status = 'available' then 'Available to start now'
      else 'Related experience'
    end as reason
  from scored s
  -- The gate. A job in Summit does not go to somebody who does not work in
  -- Summit, however good they are — "do not send unrelated job requests to
  -- every professional" is about relevance, and coming to the site is the
  -- first thing relevance means for a trade.
  where s.coverage is not null
    and s.trade > 0
    -- Below a third of the maximum it is not a match, it is filler.
    and s.total >= 0.33
  order by s.total desc, s.provider_id
  limit max_results;
$$;

grant execute on function public.match_professionals(uuid, integer) to authenticated;
