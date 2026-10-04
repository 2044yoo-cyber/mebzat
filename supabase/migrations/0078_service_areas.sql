-- Where somebody works is not where somebody lives.
--
-- `search_professionals` from 0073 filtered on `profiles.location_city`, which
-- is the professional's *base*. A welder based in Bole who is perfectly happy
-- to travel to Summit did not appear in a search for a welder in Summit, and
-- there was no column in which he could have said he would go. The two facts
-- had one field between them.
--
-- So: a base location, and a separate list of areas somebody has agreed to
-- work in. Search reads the list. The base is displayed, and is never what
-- decides whether somebody is offered for a job.

-- ---------------------------------------------------------------------------
-- Areas
-- ---------------------------------------------------------------------------

-- Seeded from src/lib/location/addis-neighbourhoods.ts, which already knew
-- every area this feature needs and where each one is. The coordinates are
-- here rather than only in TypeScript because the travel-radius match is a
-- distance comparison, and doing it in the browser would mean fetching every
-- professional in the country to filter five of them out.
--
-- scripts/professionals_check.ts asserts the two lists still agree, because
-- one gazetteer in two places is one gazetteer that drifts.
--
-- Not a country/region/city/sub-city/neighbourhood tree: four of those five
-- levels have exactly one value each in Ethiopia's only city Medosha serves
-- today, and a join through four empty tables is a tax on every query for a
-- structure nothing needs yet. The columns are here, so a second city is rows
-- rather than a migration.
create table if not exists public.location_areas (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  sub_city text,
  city text not null default 'Addis Ababa',
  region text not null default 'Addis Ababa',
  country text not null default 'Ethiopia',
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now(),

  constraint location_areas_unique unique (slug, city, country)
);

comment on table public.location_areas is
  'Named areas a job or a service area can refer to. Approximate centroids, good to about a kilometre; nothing here locates a building.';

create index if not exists location_areas_city_idx on public.location_areas (city, country);

insert into public.location_areas (slug, name, sub_city, latitude, longitude) values
  ('bole-medhanialem', 'Bole Medhanialem', 'Bole', 9.0107, 38.7817),
  ('bole-atlas', 'Bole Atlas', 'Bole', 9.008, 38.776),
  ('bole-wollo-sefer', 'Bole Wollo Sefer', 'Bole', 8.9968, 38.769),
  ('bole-bulbula', 'Bole Bulbula', 'Bole', 8.956, 38.786),
  ('bole-japan', 'Bole Japan', 'Bole', 8.993, 38.794),
  ('bole-edna-mall', 'Bole Edna Mall', 'Bole', 9.006, 38.787),
  ('bole-imperial', 'Bole Imperial', 'Bole', 9.018, 38.796),
  ('bole-denbel', 'Bole Denbel', 'Bole', 9.003, 38.776),
  ('bole', 'Bole', 'Bole', 9.01, 38.78),
  ('gerji-imperial', 'Gerji Imperial', 'Bole', 9.018, 38.808),
  ('gerji', 'Gerji', 'Bole', 9.013, 38.808),
  ('cmc', 'CMC', 'Bole', 9.029, 38.821),
  ('summit-by-cambridge', 'Summit by Cambridge', 'Bole', 9.012, 38.852),
  ('summit', 'Summit', 'Bole', 9.009, 38.848),
  ('ayat', 'Ayat', 'Yeka', 9.03, 38.87),
  ('kotebe', 'Kotebe', 'Yeka', 9.032, 38.858),
  ('wossen', 'Wossen', 'Bole', 9.023, 38.833),
  ('shola', 'Shola', 'Yeka', 9.028, 38.805),
  ('megenagna', 'Megenagna', 'Yeka', 9.02, 38.799),
  ('laga-tafo', 'Laga Tafo', 'Oromia (Legetafo)', 9.053, 38.92),
  ('22-area', '22 Area', 'Yeka', 9.018, 38.788),
  ('kazanchis', 'Kazanchis', 'Kirkos', 9.014, 38.766),
  ('meskel-flower', 'Meskel Flower', 'Kirkos', 8.993, 38.762),
  ('kebena', 'Kebena', 'Yeka', 9.027, 38.786),
  ('ferensay', 'Ferensay', 'Gulele', 9.047, 38.776),
  ('addisu-gebeya', 'Addisu Gebeya', 'Gulele', 9.045, 38.742),
  ('sarbet', 'Sarbet', 'Nifas Silk-Lafto', 8.993, 38.748),
  ('gofa', 'Gofa', 'Nifas Silk-Lafto', 8.984, 38.742),
  ('lebu-haile-garment', 'Lebu Haile Garment', 'Nifas Silk-Lafto', 8.963, 38.718),
  ('lebu', 'Lebu', 'Nifas Silk-Lafto', 8.955, 38.71),
  ('alem-bank', 'Alem Bank', 'Kolfe Keranyo', 8.988, 38.69),
  ('kolfe-keranyo', 'Kolfe Keranyo', 'Kolfe Keranyo', 9.025, 38.69),
  ('abinet', 'Abinet', 'Addis Ketema', 9.006, 38.728),
  ('old-airport', 'Old Airport', 'Nifas Silk-Lafto', 8.995, 38.73),
  ('nifas-silk-lafto', 'Nifas Silk-Lafto', 'Nifas Silk-Lafto', 8.97, 38.73),
  ('gotera', 'Gotera', 'Kirkos', 8.993, 38.757),
  ('kirkos', 'Kirkos', 'Kirkos', 9.006, 38.7565),
  ('lideta', 'Lideta', 'Lideta', 9.01, 38.737),
  ('mexico', 'Mexico', 'Kirkos', 9.006, 38.744),
  ('urael', 'Urael', 'Bole', 9.0085, 38.7705),
  ('yeka', 'Yeka', 'Yeka', 9.04, 38.8)

on conflict (slug, city, country) do nothing;

alter table public.location_areas enable row level security;

-- A gazetteer is public information and is useless if a signed-out visitor
-- cannot read it: the search form needs it to offer the job-location choices.
drop policy if exists "Areas are readable by everyone" on public.location_areas;
create policy "Areas are readable by everyone"
  on public.location_areas for select
  to authenticated, anon
  using (true);

-- ---------------------------------------------------------------------------
-- What a professional does, and how far they will go
-- ---------------------------------------------------------------------------

alter table public.profiles
  -- The trade, in the words a customer searches with: "Welder", not
  -- "Joinery & Furniture". `services.category_id` stays the taxonomy that
  -- groups them; this is the specific job title, and PROFESSIONS in
  -- src/lib/constants/professions.ts is the list the form offers.
  --
  -- Text rather than an enum: this list will grow whenever somebody names a
  -- trade nobody thought of, and a migration per trade is a reason not to add
  -- them. The server validates against the constant before writing.
  add column if not exists profession text,
  add column if not exists specialties text[] not null default '{}'::text[],
  -- The area within the city, one level finer than location_city. Displayed.
  -- Never used to decide whether somebody can take a job.
  add column if not exists base_area text,
  -- Optional. Null means "only the areas I listed".
  add column if not exists travel_radius_km integer,
  add column if not exists serves_entire_city boolean not null default false,
  -- Four separate facts. `phone_verified` already existed and is the weakest
  -- of them; a phone-verified account must not render the same as one whose
  -- trade licence somebody checked, which is what a single boolean would have
  -- made it.
  add column if not exists id_verified boolean not null default false,
  add column if not exists business_verified boolean not null default false,
  add column if not exists license_verified boolean not null default false;

comment on column public.profiles.base_area is
  'Where they are based, as an area name. Shown on the profile; never a search filter.';
comment on column public.profiles.travel_radius_km is
  'How far they will travel from base, in addition to the areas they listed. Null means the list only.';

do $$ begin
  alter table public.profiles
    add constraint profiles_travel_radius_choice
    check (travel_radius_km is null or travel_radius_km in (5, 10, 20, 50));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.profiles
    add constraint profiles_specialties_bounded
    check (
      array_length(specialties, 1) is null
      or (
        array_length(specialties, 1) <= 12
        and '' <> all (specialties)
        and char_length(array_to_string(specialties, '')) <= 480
      )
    );
exception when duplicate_object then null; end $$;

create index if not exists profiles_profession_idx on public.profiles (profession)
  where profession is not null;

-- ---------------------------------------------------------------------------
-- The areas somebody works in
-- ---------------------------------------------------------------------------

create table if not exists public.professional_service_areas (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- Denormalised alongside the slug so a row still reads correctly if an area
  -- is renamed, and so the card can list "Bole · CMC · Summit" without a join.
  area_slug text not null,
  area_name text not null,
  city text not null default 'Addis Ababa',
  country text not null default 'Ethiopia',
  created_at timestamptz not null default now(),

  constraint professional_service_areas_unique unique (profile_id, area_slug, city)
);

comment on table public.professional_service_areas is
  'Areas a professional has agreed to work in. This is what search matches on, not their base.';

create index if not exists professional_service_areas_lookup_idx
  on public.professional_service_areas (area_slug, city);
create index if not exists professional_service_areas_profile_idx
  on public.professional_service_areas (profile_id);

-- A row per area with nothing stopping it is a way to claim the whole city one
-- insert at a time and sit at the top of every search. A check constraint
-- cannot count sibling rows, so this is a trigger.
create or replace function public.enforce_service_area_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  select count(*) into n
  from public.professional_service_areas
  where profile_id = new.profile_id;

  if n >= 40 then
    raise exception 'A professional may list at most 40 service areas'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists professional_service_areas_limit on public.professional_service_areas;
create trigger professional_service_areas_limit
  before insert on public.professional_service_areas
  for each row
  execute function public.enforce_service_area_limit();

alter table public.professional_service_areas enable row level security;

-- Public: a customer has to be able to see who works in their area before
-- deciding whether to sign up.
drop policy if exists "Service areas are readable by everyone" on public.professional_service_areas;
create policy "Service areas are readable by everyone"
  on public.professional_service_areas for select
  to authenticated, anon
  using (true);

drop policy if exists "Professionals manage their own service areas" on public.professional_service_areas;
create policy "Professionals manage their own service areas"
  on public.professional_service_areas for insert
  to authenticated
  with check (auth.uid() = profile_id);

drop policy if exists "Professionals remove their own service areas" on public.professional_service_areas;
create policy "Professionals remove their own service areas"
  on public.professional_service_areas for delete
  to authenticated
  using (auth.uid() = profile_id);

-- ---------------------------------------------------------------------------
-- Finding somebody who will come to the job
-- ---------------------------------------------------------------------------

-- 0073's version took `p_city` and compared it to `profiles.location_city`.
-- The signature changes, so the old one is dropped rather than overloaded:
-- two functions of the same name differing only in argument count is a call
-- that resolves to whichever PostgreSQL prefers, which is not a thing to leave
-- to chance in a search path.
drop function if exists public.search_professionals(
  text, text, text, numeric, boolean, boolean, integer, integer
);

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

-- ---------------------------------------------------------------------------
-- The new badges cannot be self-granted either
-- ---------------------------------------------------------------------------

-- 0068 guards `phone_verified` and `verification_status` against being written
-- from a browser session, and says in its own comment that identity,
-- professional and business verification "are real processes that have not
-- happened". They have columns now, and a column a member can set on
-- themselves is a badge that means nothing — worse than no badge, because the
-- whole point of section 14 is that these three outrank a phone number.
--
-- The function is replaced rather than a second trigger added: two triggers on
-- one table both raising on the same update is one of them being dead code,
-- and which one fires first is alphabetical luck.
create or replace function public.prevent_verification_self_grant()
returns trigger
language plpgsql
-- `security invoker`, deliberately, for the reason 0068 gives: as a definer
-- this runs as its owner, `current_user` could never be an API role, and the
-- guard would read as protection while permitting everything.
security invoker
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.phone_verified is distinct from old.phone_verified then
      raise exception 'phone_verified cannot be changed from an authenticated session';
    end if;
    if new.verification_status is distinct from old.verification_status then
      raise exception 'verification_status cannot be changed from an authenticated session';
    end if;
    if new.id_verified is distinct from old.id_verified then
      raise exception 'id_verified cannot be changed from an authenticated session';
    end if;
    if new.business_verified is distinct from old.business_verified then
      raise exception 'business_verified cannot be changed from an authenticated session';
    end if;
    if new.license_verified is distinct from old.license_verified then
      raise exception 'license_verified cannot be changed from an authenticated session';
    end if;
  end if;
  return new;
end;
$$;
