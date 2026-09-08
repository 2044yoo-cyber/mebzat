-- ---------------------------------------------------------------------------
-- Used items
-- ---------------------------------------------------------------------------
--
-- A second-hand section of the marketplace, open to everybody rather than to
-- construction professionals: a sofa, a fridge and a pallet of leftover tiles
-- are the same transaction as far as Medosha is concerned, and splitting them
-- into two marketplaces would mean two listing flows, two search surfaces and
-- two sets of seller reputation.
--
-- So there is no second product table. `products.condition` is the single
-- source of truth: a listing appears under Used Items because its condition
-- says `used`, and the badge on the card is drawn from the same column. A
-- seller cannot label a listing "used" independently of what the database
-- records, because there is nothing else to label it with.

-- ---------------------------------------------------------------------------
-- Vocabulary
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'product_condition') then
    -- Five values, two of them reachable from the form today. The others are
    -- here because adding an enum value later is a migration and a deploy,
    -- while leaving room costs nothing — and because a marketplace that grows
    -- "refurbished" tends to grow it suddenly.
    create type public.product_condition as enum (
      'new',
      'used',
      'refurbished',
      'open_box',
      'for_parts'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'used_grade') then
    create type public.used_grade as enum (
      'like_new',
      'good',
      'fair',
      'needs_repair'
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table public.products
  add column if not exists condition public.product_condition not null default 'new',
  add column if not exists used_grade public.used_grade,
  add column if not exists condition_notes text,
  add column if not exists known_defects text,
  add column if not exists sale_reason text,
  -- Approximate, and optional. Somebody selling a fridge knows roughly how old
  -- it is and usually not the month they bought it.
  add column if not exists age_months integer,
  -- A neighbourhood or sub-city, not an address. `products` has never carried
  -- a street or coordinates and this does not add one: a second-hand listing
  -- is somebody's home, and "come to 4 Kilo" is the level of detail a buyer
  -- needs before a conversation has happened.
  add column if not exists location_area text;

comment on column public.products.condition is
  'The source of truth for which marketplace section a listing appears in. Never derived from anything the seller types.';
comment on column public.products.location_area is
  'A neighbourhood or sub-city. Never a street address: the seller gives the rest in a message, once they have decided to.';

-- ---------------------------------------------------------------------------
-- What may be true together
-- ---------------------------------------------------------------------------

-- A grade, defects and a reason for selling only mean anything about something
-- second-hand. Without this a listing could sit under New Items while carrying
-- "Fair — needs repair", which is a listing that says two things at once.
alter table public.products
  drop constraint if exists products_used_fields_need_used_condition;
alter table public.products
  add constraint products_used_fields_need_used_condition check (
    condition <> 'new'
    or (
      used_grade is null
      and condition_notes is null
      and known_defects is null
      and sale_reason is null
      and age_months is null
    )
  );

alter table public.products
  drop constraint if exists products_age_months_sane;
alter table public.products
  add constraint products_age_months_sane check (
    age_months is null or (age_months >= 0 and age_months <= 1200)
  );

-- The section a listing belongs to is read on every marketplace page.
create index if not exists products_condition_idx
  on public.products (condition, created_at desc)
  where status = 'published';

create index if not exists products_used_grade_idx
  on public.products (used_grade)
  where status = 'published' and condition <> 'new';

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------

-- Added to the shared category table rather than a used-items-only one. A
-- refrigerator is a refrigerator whether it is new or second-hand, and a
-- separate taxonomy would mean a listing changing category when its condition
-- changed.
--
-- `doors` and `windows` already exist separately and stay that way: merging
-- them into one "Doors & Windows" category would move every existing listing.
insert into public.product_categories (slug, name, icon, position) values
  ('appliances', 'Appliances', 'WashingMachine', 12),
  ('electronics', 'Electronics', 'Tv', 13),
  ('tools', 'Tools', 'Wrench', 14),
  ('machinery', 'Machinery', 'Tractor', 15),
  ('office', 'Office', 'Briefcase', 16),
  ('home', 'Home', 'House', 17),
  ('other', 'Other', 'Package', 18)
on conflict (slug) do nothing;
