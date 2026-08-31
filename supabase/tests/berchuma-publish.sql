-- Berchuma Studio — saving, publishing and remixing.
--
-- Run this in the Supabase SQL editor after applying 0030. It prints one line
-- per check and rolls itself back.
--
-- Like `berchuma-security.sql`, it runs as `authenticated`. A probe run as the
-- editor's default role bypasses row-level security entirely and reports that
-- every rule works, which is worse than no probe at all.
--
-- What is being checked is the claim phase 4 rests on: that saving, versioning
-- and posting to the feed need no new permissions, no service-role key and no
-- security-definer function — they pass the policies that were already there.

begin;

insert into auth.users (id, email) values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'berchuma-pub-a@example.test'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'berchuma-pub-b@example.test');

create temporary table probe (name text, passed boolean, detail text);
grant all on probe to authenticated;

set local role authenticated;
set local request.jwt.claim.sub = 'bbbbbbbb-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';

-- ---------------------------------------------------------------------------
-- Saving
-- ---------------------------------------------------------------------------

do $$
declare
  new_slug text;
  -- Not called `design_id`: a variable with the same name as the column makes
  -- `where design_id = design_id` a tautology, and PL/pgSQL is right to refuse
  -- to guess which one you meant.
  saved uuid;
begin
  -- Exactly what the application does: ask for a slug, then insert.
  new_slug := public.design_slug('Three-bay walnut wardrobe');

  insert into public.designs (slug, owner_id, kind, title, prompt, spec, estimated_cost, price_confidence)
  values (new_slug, 'bbbbbbbb-0000-4000-8000-000000000001', 'wardrobe',
          'Three-bay walnut wardrobe', 'a walnut wardrobe for a 2.4 m wall',
          '{"version":1}'::jsonb, 62893, 0)
  returning id into saved;

  insert into probe values ('an owner can save a design with no extra grants', true, new_slug);

  -- The slug must be usable in a URL and must not be the title.
  insert into probe values (
    'the slug is url-safe and unique',
    new_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and new_slug <> 'Three-bay walnut wardrobe',
    new_slug);

  insert into public.design_versions (design_id, version, spec, note, author_id, estimated_cost)
  values (saved, 1, '{"version":1}'::jsonb, 'a walnut wardrobe for a 2.4 m wall',
          'bbbbbbbb-0000-4000-8000-000000000001', 62893);

  insert into probe
  select 'a version is written under the same policy', count(*) = 1, count(*)::text
  from public.design_versions v where v.design_id = saved;
end $$;

-- ---------------------------------------------------------------------------
-- Publishing
-- ---------------------------------------------------------------------------

do $$
declare
  d public.designs%rowtype;
begin
  select * into d from public.designs
   where owner_id = 'bbbbbbbb-0000-4000-8000-000000000001' limit 1;

  update public.designs
     set visibility = 'public', published_at = now()
   where id = d.id;

  select * into d from public.designs where id = d.id;
  insert into probe values ('publishing sets visibility and a timestamp',
    d.visibility = 'public' and d.published_at is not null, d.visibility::text);

  -- The feed card. Written by the author, under `feed_posts_write`.
  insert into public.feed_posts (
    kind, topic, title, body, author_id, author_key, author_name,
    link_href, link_label, entity_type, entity_id, status, published_at
  )
  values (
    'ai_design', 'design', d.title, d.prompt,
    'bbbbbbbb-0000-4000-8000-000000000001',
    'profile:bbbbbbbb-0000-4000-8000-000000000001', 'Probe author',
    '/designs/' || d.slug, 'Open the design', 'design', d.id, 'published', now()
  );

  insert into probe
  select 'publishing puts one card on the feed', count(*) = 1, count(*)::text
  from public.feed_posts where entity_type = 'design' and entity_id = d.id;

  -- Pressing publish twice, or a client retrying a request it could not tell
  -- had succeeded. The index from 0030 is what makes this a no-op.
  begin
    insert into public.feed_posts (
      kind, topic, title, author_id, author_key, author_name,
      entity_type, entity_id, status, published_at
    )
    values (
      'ai_design', 'design', d.title,
      'bbbbbbbb-0000-4000-8000-000000000001',
      'profile:bbbbbbbb-0000-4000-8000-000000000001', 'Probe author',
      'design', d.id, 'published', now()
    )
    on conflict do nothing;

    insert into probe
    select 'publishing twice does not post twice', count(*) = 1, count(*)::text
    from public.feed_posts where entity_type = 'design' and entity_id = d.id;
  exception when others then
    insert into probe values ('publishing twice does not post twice', false, sqlerrm);
  end;

  -- And the index must not stop two different designs from appearing.
  insert into public.designs (slug, owner_id, kind, title, spec, visibility, published_at)
  values (public.design_slug('Second design'), 'bbbbbbbb-0000-4000-8000-000000000001',
          'tv_unit', 'Second design', '{"version":1}'::jsonb, 'public', now());

  begin
    insert into public.feed_posts (
      kind, topic, title, author_id, author_key, author_name,
      entity_type, entity_id, status, published_at
    )
    select 'ai_design', 'design', s.title,
           'bbbbbbbb-0000-4000-8000-000000000001',
           'profile:bbbbbbbb-0000-4000-8000-000000000001', 'Probe author',
           'design', s.id, 'published', now()
    from public.designs s where s.title = 'Second design';

    insert into probe
    select 'a second design still gets its own card', count(*) = 2, count(*)::text
    from public.feed_posts where entity_type = 'design';
  exception when others then
    insert into probe values ('a second design still gets its own card', false, sqlerrm);
  end;
end $$;

-- ---------------------------------------------------------------------------
-- What the second user sees
-- ---------------------------------------------------------------------------

set local request.jwt.claim.sub = 'bbbbbbbb-0000-4000-8000-000000000002';

insert into probe
select 'a published design is listed publicly', count(*) >= 1, count(*)::text
from public.public_designs(48, null, false, null);

insert into probe
select 'a published design is findable by search', count(*) = 1, count(*)::text
from public.search_designs('walnut wardrobe', 10);

-- The gallery must never leak an unpublished design.
do $$
declare
  hidden_id uuid;
begin
  set local request.jwt.claim.sub = 'bbbbbbbb-0000-4000-8000-000000000001';
  insert into public.designs (slug, owner_id, kind, title, spec)
  values (public.design_slug('Unpublished sketch'), 'bbbbbbbb-0000-4000-8000-000000000001',
          'shelving', 'Unpublished sketch', '{"version":1}'::jsonb)
  returning id into hidden_id;

  set local request.jwt.claim.sub = 'bbbbbbbb-0000-4000-8000-000000000002';
  insert into probe
  select 'an unpublished design is not in the gallery', count(*) = 0, count(*)::text
  from public.public_designs(48, null, false, null) g where g.id = hidden_id;

  insert into probe
  select 'an unpublished design is not in search', count(*) = 0, count(*)::text
  from public.search_designs('Unpublished sketch', 10);
end $$;

-- ---------------------------------------------------------------------------
-- Remixing a published design
-- ---------------------------------------------------------------------------

do $$
declare
  source uuid;
  child uuid;
  child_row public.designs%rowtype;
begin
  select id into source from public.designs where title = 'Three-bay walnut wardrobe';
  child := public.berchuma_remix(source, 'My version');
  select * into child_row from public.designs where id = child;

  insert into probe values ('a remix belongs to the person who made it',
    child_row.owner_id = 'bbbbbbbb-0000-4000-8000-000000000002', child_row.owner_id::text);

  insert into probe values ('a remix carries the spec across',
    child_row.spec is not null, child_row.spec::text);

  insert into probe values ('a remix is private until its owner publishes it',
    child_row.visibility = 'private', child_row.visibility::text);

  -- A remix must not appear on the feed by itself. Publishing is a decision.
  insert into probe
  select 'a remix posts nothing to the feed on its own', count(*) = 0, count(*)::text
  from public.feed_posts where entity_type = 'design' and entity_id = child;

  -- The href in the notification has to be the page that exists.
  set local request.jwt.claim.sub = 'bbbbbbbb-0000-4000-8000-000000000001';
  insert into probe
  select 'the remix notification links to the new design',
         count(*) = 1, coalesce(max(n.href), 'none')
  from public.notifications n
  where n.kind = 'design_remix'
    and n.user_id = 'bbbbbbbb-0000-4000-8000-000000000001'
    and n.href = '/designs/' || child_row.slug;
end $$;

-- ---------------------------------------------------------------------------
-- Results
-- ---------------------------------------------------------------------------

reset role;

select
  case when passed then '  PASS' else '✗ FAIL' end as result,
  name,
  case when passed then '' else detail end as detail
from probe
order by passed, name;

select
  count(*) filter (where passed) || ' passed, ' ||
  count(*) filter (where not passed) || ' failed' as summary
from probe;

rollback;
