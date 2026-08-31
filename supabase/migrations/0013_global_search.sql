-- Phase 3: Global search.
--
-- One function that searches every entity in the platform and returns a single
-- ranked result set. Additive only — no existing table is altered.
--
-- Written as a UNION ALL of per-table queries, each with its own LIMIT, rather
-- than one materialised search table. A search index that has to be kept in
-- step with eleven tables is a second source of truth that will drift; a UNION
-- reads the live rows and every branch hits the index that table already has
-- from its own migration.
--
-- Each branch returns the same shape, so the UI renders one list without
-- knowing which table a row came from.

create type public.search_kind as enum (
  'product',
  'company',
  'project',
  'professional',
  'price',
  'post',
  'job',
  'equipment',
  'service',
  'event',
  'hashtag'
);

-- ---------------------------------------------------------------------------
-- global_search
-- ---------------------------------------------------------------------------

/**
 * Searches everything.
 *
 * `per_kind` caps each branch so one popular table cannot crowd the others out
 * of the result list — a search for "cement" should show the companies and the
 * posts, not forty products.
 *
 * Ranking is by a simple relevance score: a prefix match on the title beats a
 * match anywhere in the title, which beats a match in the body. Cheap to
 * compute and it puts the obvious answer first, which is what a search box is
 * judged on.
 */
create function public.global_search(
  q text,
  per_kind integer default 5,
  kinds public.search_kind[] default null
)
returns table (
  kind public.search_kind,
  id uuid,
  title text,
  subtitle text,
  detail text,
  image_url text,
  href text,
  score real
)
language sql
stable
security definer
set search_path = public
as $$
with term as (
  -- Trim and collapse whitespace; a trailing space should not change results.
  select nullif(regexp_replace(trim(q), '\s+', ' ', 'g'), '') as text
),
pattern as (
  select
    text,
    '%' || replace(replace(text, '%', '\%'), '_', '\_') || '%' as anywhere,
    replace(replace(text, '%', '\%'), '_', '\_') || '%' as prefix
  from term
  where text is not null
)
select * from (
  (
    -- The first branch names the union's columns, so the outer ORDER BY has
    -- something to sort on; the rest match it positionally.
    select
      'product'::public.search_kind as kind,
      p.id as id,
      p.title as title,
      coalesce(c.name, 'Marketplace') as subtitle,
      (case when p.price is null then null
            else p.currency || ' ' || p.price::text end) as detail,
      p.cover_image_url as image_url,
      ('/marketplace/' || p.id) as href,
      (case when p.title ilike pattern.prefix then 3.0 else 1.0 end)::real as score
    from public.products p
    cross join pattern
    left join public.product_categories c on c.id = p.category_id
    where p.status = 'published'
      and (p.title ilike pattern.anywhere
           or p.brand ilike pattern.anywhere
           or p.description ilike pattern.anywhere)
      and (kinds is null or 'product' = any (kinds))
    order by (case when p.title ilike pattern.prefix then 3.0 else 1.0 end) desc,
             p.views desc
    limit per_kind
  )
  union all
  (
    select
      'company'::public.search_kind,
      c.id,
      c.name,
      coalesce(c.city, 'Company'),
      c.category,
      c.logo_url,
      '/companies/' || c.slug,
      (case when c.name ilike pattern.prefix then 3.5 else 1.5 end)::real
    from public.companies c
    cross join pattern
    where (c.name ilike pattern.anywhere
           or c.category ilike pattern.anywhere
           or c.description ilike pattern.anywhere)
      and (kinds is null or 'company' = any (kinds))
    order by (case when c.name ilike pattern.prefix then 3.5 else 1.5 end) desc
    limit per_kind
  )
  union all
  (
    select
      'project'::public.search_kind,
      pr.id,
      pr.title,
      coalesce(pr.location_city, 'Project'),
      pr.building_type::text,
      pr.cover_image_url,
      '/projects/' || pr.id,
      (case when pr.title ilike pattern.prefix then 3.0 else 1.0 end)::real
    from public.projects pr
    cross join pattern
    where pr.status = 'published'
      and (pr.title ilike pattern.anywhere
           or pr.description ilike pattern.anywhere)
      and (kinds is null or 'project' = any (kinds))
    order by (case when pr.title ilike pattern.prefix then 3.0 else 1.0 end) desc
    limit per_kind
  )
  union all
  (
    select
      'professional'::public.search_kind,
      pf.id,
      coalesce(pf.full_name, pf.company_name, pf.username),
      coalesce(pf.account_type::text, 'Professional'),
      pf.location_city,
      pf.avatar_url,
      '/u/' || pf.username,
      (case
         when coalesce(pf.full_name, pf.company_name, pf.username) ilike pattern.prefix
         then 3.0 else 1.0
       end)::real
    from public.profiles pf
    cross join pattern
    where pf.username is not null
      and (pf.full_name ilike pattern.anywhere
           or pf.company_name ilike pattern.anywhere
           or pf.username ilike pattern.anywhere
           or pf.bio ilike pattern.anywhere)
      and (kinds is null or 'professional' = any (kinds))
    order by pf.profile_views desc
    limit per_kind
  )
  union all
  (
    -- Covers both "Price Exchange" and "Materials": a material is a listing in
    -- the material sector, so one branch serves both filters.
    select
      'price'::public.search_kind,
      l.id,
      l.item,
      l.category,
      l.currency || ' ' || l.current_price::text || ' / ' || l.unit,
      null,
      '/price-exchange/' || l.id,
      (case when l.item ilike pattern.prefix then 3.0 else 1.0 end)::real
    from public.price_listings l
    cross join pattern
    where l.published
      and (l.item ilike pattern.anywhere
           or l.category ilike pattern.anywhere
           or l.brand ilike pattern.anywhere
           or l.specification ilike pattern.anywhere)
      and (kinds is null or 'price' = any (kinds))
    order by (case when l.item ilike pattern.prefix then 3.0 else 1.0 end) desc,
             l.current_price asc
    limit per_kind
  )
  union all
  (
    select
      'post'::public.search_kind,
      po.id,
      coalesce(po.title, left(po.body, 80)),
      po.kind::text,
      left(po.body, 140),
      null,
      '/community/' || po.id,
      (case when po.title ilike pattern.prefix then 2.5 else 0.8 end)::real
    from public.posts po
    cross join pattern
    where po.status = 'published'
      and (po.title ilike pattern.anywhere or po.body ilike pattern.anywhere)
      and (kinds is null or 'post' = any (kinds))
    order by po.like_count desc, po.created_at desc
    limit per_kind
  )
  union all
  (
    select
      'job'::public.search_kind,
      j.id,
      j.title,
      coalesce(co.name, j.location_city, 'Job'),
      j.job_type::text,
      co.logo_url,
      '/jobs/' || j.id,
      (case when j.title ilike pattern.prefix then 3.0 else 1.0 end)::real
    from public.jobs j
    cross join pattern
    left join public.companies co on co.id = j.company_id
    where j.status = 'open'
      and (j.title ilike pattern.anywhere
           or j.profession ilike pattern.anywhere
           or j.description ilike pattern.anywhere)
      and (kinds is null or 'job' = any (kinds))
    order by j.created_at desc
    limit per_kind
  )
  union all
  (
    select
      'equipment'::public.search_kind,
      e.id,
      e.title,
      e.category,
      case when e.daily_rate is null then null
           else e.currency || ' ' || e.daily_rate::text || ' / day' end,
      e.cover_image_url,
      '/equipment/' || e.id,
      (case when e.title ilike pattern.prefix then 3.0 else 1.0 end)::real
    from public.equipment e
    cross join pattern
    where e.status = 'published'
      and (e.title ilike pattern.anywhere
           or e.category ilike pattern.anywhere
           or e.brand ilike pattern.anywhere
           or e.model ilike pattern.anywhere)
      and (kinds is null or 'equipment' = any (kinds))
    order by e.rating desc
    limit per_kind
  )
  union all
  (
    select
      'service'::public.search_kind,
      s.id,
      s.title,
      coalesce(sc.name, 'Service'),
      case when s.price_from is null then s.pricing::text
           else s.currency || ' ' || s.price_from::text || '+' end,
      s.cover_image_url,
      '/services/' || s.id,
      (case when s.title ilike pattern.prefix then 3.0 else 1.0 end)::real
    from public.services s
    cross join pattern
    left join public.service_categories sc on sc.id = s.category_id
    where s.status = 'published'
      and (s.title ilike pattern.anywhere or s.description ilike pattern.anywhere)
      and (kinds is null or 'service' = any (kinds))
    order by s.rating desc
    limit per_kind
  )
  union all
  (
    select
      'event'::public.search_kind,
      ev.id,
      ev.title,
      ev.kind::text,
      to_char(ev.starts_at, 'DD Mon YYYY'),
      ev.cover_image_url,
      '/events/' || ev.id,
      (case when ev.title ilike pattern.prefix then 3.0 else 1.0 end)::real
    from public.events ev
    cross join pattern
    where ev.status = 'published'
      and (ev.title ilike pattern.anywhere
           or ev.description ilike pattern.anywhere
           or ev.venue ilike pattern.anywhere)
      and (kinds is null or 'event' = any (kinds))
    order by ev.starts_at asc
    limit per_kind
  )
  union all
  (
    select
      'hashtag'::public.search_kind,
      h.id,
      '#' || h.tag,
      'Hashtag',
      h.post_count::text || ' posts',
      null,
      '/community?tag=' || h.tag,
      -- Tags rank high on a prefix because typing "#con" means the tag.
      (case when h.tag ilike pattern.prefix then 4.0 else 1.0 end)::real
    from public.hashtags h
    cross join pattern
    where (h.tag ilike pattern.anywhere
           or h.tag ilike replace(pattern.anywhere, '#', ''))
      and (kinds is null or 'hashtag' = any (kinds))
    order by h.post_count desc
    limit per_kind
  )
) results
order by score desc, title asc;
$$;

comment on function public.global_search(text, integer, public.search_kind[]) is
  'Searches products, companies, projects, professionals, prices, posts, jobs, equipment, services, events and hashtags in one call.';

-- ---------------------------------------------------------------------------
-- search_suggestions
-- The typeahead. Two results per kind and no bodies, because it renders under
-- a text box while someone is still typing.
-- ---------------------------------------------------------------------------

create function public.search_suggestions(q text, max_results integer default 8)
returns table (
  kind public.search_kind,
  id uuid,
  title text,
  subtitle text,
  href text,
  score real
)
language sql
stable
security definer
set search_path = public
as $$
  select s.kind, s.id, s.title, s.subtitle, s.href, s.score
  from public.global_search(q, 2) s
  limit max_results;
$$;

-- ---------------------------------------------------------------------------
-- Trigram indexes
-- The ILIKE '%term%' patterns above cannot use a b-tree. pg_trgm makes them
-- indexable; without the extension the searches still work, just sequentially,
-- so the whole block is conditional rather than a hard requirement.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_trgm') then
    create extension if not exists pg_trgm;

    create index if not exists products_title_trgm
      on public.products using gin (title gin_trgm_ops);
    create index if not exists companies_name_trgm
      on public.companies using gin (name gin_trgm_ops);
    create index if not exists projects_title_trgm
      on public.projects using gin (title gin_trgm_ops);
    create index if not exists profiles_name_trgm
      on public.profiles using gin (
        (coalesce(full_name, '') || ' ' || coalesce(company_name, '') || ' ' ||
         coalesce(username, '')) gin_trgm_ops
      );
    create index if not exists price_listings_item_trgm
      on public.price_listings using gin (item gin_trgm_ops);
    create index if not exists posts_title_trgm
      on public.posts using gin ((coalesce(title, '')) gin_trgm_ops);
    create index if not exists jobs_title_trgm
      on public.jobs using gin (title gin_trgm_ops);
    create index if not exists equipment_title_trgm
      on public.equipment using gin (title gin_trgm_ops);
    create index if not exists services_title_trgm
      on public.services using gin (title gin_trgm_ops);
    create index if not exists events_title_trgm
      on public.events using gin (title gin_trgm_ops);
    create index if not exists hashtags_tag_trgm
      on public.hashtags using gin (tag gin_trgm_ops);
  end if;
end
$$;

grant execute on function public.global_search(text, integer, public.search_kind[]) to anon, authenticated;
grant execute on function public.search_suggestions(text, integer) to anon, authenticated;
