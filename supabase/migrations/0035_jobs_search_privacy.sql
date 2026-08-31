-- Jobs — keeping private jobs out of search.
--
-- `global_search` was written in 0020, before jobs had a visibility setting.
-- Its jobs branch filters on `status = 'open'` and nothing else, so adding a
-- "Private" option in 0033 produced a setting that the job list honoured and
-- search did not — a leak that looks exactly like a working feature, which is
-- the kind that survives.
--
-- The function is `security definer`, so row-level security cannot cover for
-- it: the filter has to be inside. Replacing a 300-line function to change one
-- line is unpleasant, and the alternative — leaving the leak — is worse.
--
-- The body below is the function as it actually exists in the database,
-- extracted with `pg_get_functiondef` rather than retyped, with exactly one
-- condition added. That is why it is long and why the rest of it is unchanged.

begin;

do $$
begin
  if to_regclass('public.jobs') is null then
    raise exception using
      message = 'Jobs: public.jobs does not exist.',
      hint = 'Apply the earlier migrations first.';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'jobs'
      and column_name = 'visibility'
  ) then
    raise exception using
      message = 'Jobs: public.jobs has no visibility column.',
      hint = 'Run 0033_jobs.sql before this file.';
  end if;
end $$;

CREATE OR REPLACE FUNCTION public.global_search(q text, per_kind integer DEFAULT 5, kinds search_kind[] DEFAULT NULL::search_kind[])
 RETURNS TABLE(kind search_kind, id uuid, title text, subtitle text, detail text, image_url text, href text, score real)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- A private job is reachable by its link and by the people invited to
    -- it, and by nobody else. Search is the one place that rule can be
    -- broken silently, because a leak here looks like a working feature.
    where j.status = 'open'
      and j.visibility = 'public'
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
  union all
  (
    select
      'investment'::public.search_kind,
      v.id,
      v.title,
      v.location || ' · ' || v.city,
      v.currency || ' ' || to_char(v.funding_goal, 'FM999,999,999') ||
        case when v.expected_roi_pct is null then ''
             else ' · ' || v.expected_roi_pct::text || '% ROI' end ||
        case when v.is_demo then ' · DEMO' else '' end,
      v.hero_image_url,
      '/invest/' || v.slug,
      (case when v.title ilike pattern.prefix then 3.0 else 1.0 end)::real
    from public.invest_projects v
    cross join pattern
    where v.published
      and (v.title ilike pattern.anywhere
           or v.location ilike pattern.anywhere
           or v.developer_name ilike pattern.anywhere
           or v.summary ilike pattern.anywhere)
      and (kinds is null or 'investment' = any (kinds))
    order by v.funding_goal desc
    limit per_kind
  )
) results
order by score desc, title asc;
$function$;

grant execute on function public.global_search(text, integer, public.search_kind[])
  to anon, authenticated;

commit;
