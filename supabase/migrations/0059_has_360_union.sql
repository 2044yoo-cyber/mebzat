-- Two triggers were writing properties.has_360, and each wiped the other.
--
-- 0017 set it from property_media: true when the property has a panorama_360
-- row. 0057 — mine — set it from tours: true when the property has a published
-- tour. Neither knew about the other, so whichever fired last won:
--
--   publish a tour           -> has_360 = true
--   add an ordinary photo    -> has_360 = false
--
-- The second write has nothing to do with 360° content. Adding a kitchen photo
-- to a listing with a published tour turned its badge off on the map, and
-- nothing anywhere reported an error. Reproduced on PostgreSQL 16 before this
-- migration was written, and again after it, to confirm it is fixed.
--
-- The fix is one function that both triggers call, so there is a single answer
-- to "does this property have 360° content" rather than two that disagree.

/**
 * Whether a property has 360° content, from either source.
 *
 * `security definer` because it must report what is *there*, not what the
 * current reader may see. A signed-out visitor cannot select a draft tour, and
 * the flag would otherwise flicker depending on who last touched the row.
 *
 * The ownership join is not incidental. tours.property_id carries no ownership
 * check — anyone may build a tour and point it at any listing — so without it
 * a stranger could publish a tour aimed at somebody else's property and turn
 * on its 360° badge. Only a tour by the property's own owner counts.
 */
create or replace function public.property_has_360(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.property_media m
    where m.property_id = target and m.kind = 'panorama_360'
  ) or exists (
    select 1
    from public.tours t
    join public.properties p on p.id = t.property_id
    where t.property_id = target
      and t.visibility = 'published'
      and t.owner_id = p.owner_id
  );
$$;

-- ------------------------------------------------------- the two trigger sides

/** 0017's version, now asking the shared question. has_virtual_tour is
 * unchanged: it has only ever meant property_media. */
create or replace function public.refresh_property_media_flags()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.property_id, old.property_id);
begin
  update public.properties p
  set has_360 = public.property_has_360(target),
      has_virtual_tour = exists (
        select 1 from public.property_media m
        where m.property_id = target
          and m.kind in ('virtual_tour', 'panorama_360')
      )
  where p.id = target;
  return coalesce(new, old);
end;
$$;

/** 0057's version, asking the same question. */
create or replace function public.sync_property_has_360()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target uuid;
begin
  target := coalesce(new.property_id, old.property_id);
  if target is null then return coalesce(new, old); end if;

  update public.properties p
  set has_360 = public.property_has_360(target)
  where p.id = target;

  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------- the backfill
--
-- Any property whose flag was wiped by the losing trigger is still wrong in the
-- table. Recomputed once here rather than left to whoever next edits the row.

update public.properties p
set has_360 = public.property_has_360(p.id)
where p.has_360 is distinct from public.property_has_360(p.id);
