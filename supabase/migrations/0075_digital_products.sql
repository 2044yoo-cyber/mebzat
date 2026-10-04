-- ---------------------------------------------------------------------------
-- Digital products
-- ---------------------------------------------------------------------------
--
-- The Digital Marketplace tab pointed at `/designs`, which is Berchuma
-- Studio's gallery — a different product with a different purpose. It is a
-- place to open somebody's fitted-wardrobe design and remix it, not a place to
-- buy anything. Anybody who tapped the tab expecting a shop found a portfolio.
--
-- A digital product is a marketplace listing whose deliverable is a file
-- rather than a thing in a van: a course, a SketchUp model, a 3D file, a floor
-- plan. So it is a row in `products` like every other listing, with one column
-- deciding which section it appears in — the same arrangement 0074 used for
-- second-hand goods, and for the same reason. No second product table, no
-- second seller, no second search.
--
-- The three sections are disjoint by construction:
--
--   Digital     fulfilment = 'digital'
--   New Items   fulfilment = 'physical' and condition = 'new'
--   Used Items  fulfilment = 'physical' and condition <> 'new'

-- ---------------------------------------------------------------------------
-- Vocabulary
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'product_fulfilment') then
    create type public.product_fulfilment as enum ('physical', 'digital');
  end if;

  if not exists (select 1 from pg_type where typname = 'digital_kind') then
    create type public.digital_kind as enum (
      'course',
      'sketchup',
      'model_3d',
      'floor_plan',
      'other'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'digital_license') then
    -- What the buyer may do with the file. The distinction that matters to
    -- somebody selling a floor plan is whether it may be built and sold on.
    create type public.digital_license as enum ('personal', 'commercial');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table public.products
  add column if not exists fulfilment public.product_fulfilment
    not null default 'physical',
  add column if not exists digital_kind public.digital_kind,
  -- Free text, because "SKP + DWG + PDF" is a real answer and an enum of file
  -- extensions would be wrong within a month.
  add column if not exists file_format text,
  add column if not exists file_size_mb numeric(10, 2),
  add column if not exists license public.digital_license,
  -- Placed by Medosha to show what the section is for. Distinguishable at a
  -- glance, the same way a sample property is: a listing nobody can buy that
  -- looks like one they can is worse than an empty page.
  add column if not exists is_sample boolean not null default false;

comment on column public.products.fulfilment is
  'Whether the deliverable is a file or a thing. Decides the marketplace section, with condition.';
comment on column public.products.is_sample is
  'Placed by Medosha to illustrate the section. Never a listing anybody can buy.';

-- ---------------------------------------------------------------------------
-- What may be true together
-- ---------------------------------------------------------------------------

-- A file format on a sofa, or a kind of "SketchUp" on a bag of cement, is a
-- listing saying two things at once.
alter table public.products
  drop constraint if exists products_digital_fields_need_digital;
alter table public.products
  add constraint products_digital_fields_need_digital check (
    fulfilment = 'digital'
    or (
      digital_kind is null
      and file_format is null
      and file_size_mb is null
      and license is null
    )
  );

-- A digital product has a kind. Without this the Digital Marketplace would
-- have a filter rail that some of its listings answer to and others do not.
alter table public.products
  drop constraint if exists products_digital_needs_kind;
alter table public.products
  add constraint products_digital_needs_kind check (
    fulfilment <> 'digital' or digital_kind is not null
  );

-- A downloaded file is not second-hand, and it does not come in a van. Both
-- would put the listing in two sections at once.
alter table public.products
  drop constraint if exists products_digital_is_new;
alter table public.products
  add constraint products_digital_is_new check (
    fulfilment <> 'digital' or (condition = 'new' and delivery_available = false)
  );

alter table public.products
  drop constraint if exists products_file_size_sane;
alter table public.products
  add constraint products_file_size_sane check (
    file_size_mb is null or (file_size_mb > 0 and file_size_mb <= 100000)
  );

create index if not exists products_fulfilment_idx
  on public.products (fulfilment, created_at desc)
  where status = 'published';

create index if not exists products_digital_kind_idx
  on public.products (digital_kind)
  where status = 'published' and fulfilment = 'digital';

create index if not exists products_is_sample_idx
  on public.products (is_sample)
  where is_sample;

-- ---------------------------------------------------------------------------
-- A sample seller
--
-- Inserted into auth.users, which fires the trigger from 0001 and creates the
-- profile. Writing to public.profiles directly would leave an account that
-- cannot be signed into and that no foreign key from auth would protect.
--
-- No password and no confirmed email: display only. Nobody can sign in as it,
-- which is the intended level of access for an account that is not a person.
-- ---------------------------------------------------------------------------

insert into auth.users (id, email)
values ('d5000000-0000-4000-8000-000000000001', 'samples@medosha.invalid')
on conflict (id) do nothing;

update public.profiles p
set full_name = 'Medosha Samples',
    company_name = 'Medosha',
    username = 'medosha_samples',
    location_city = 'Addis Ababa',
    location_country = 'Ethiopia',
    account_type = 'individual',
    bio = 'Sample listings placed by Medosha to show what the Digital '
          'Marketplace is for. Not a real seller, and nothing here is for sale.',
    is_demo = true
where p.id = 'd5000000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- Five samples, one of each kind
-- ---------------------------------------------------------------------------

insert into public.products (
  id, owner_id, title, slug, description, price, currency,
  fulfilment, digital_kind, file_format, file_size_mb, license,
  stock_status, status, is_sample, delivery_available, condition
)
values
  ('d5100000-0000-4000-8000-000000000001',
   'd5000000-0000-4000-8000-000000000001',
   'Reinforced concrete detailing — video course',
   'sample-rc-detailing-course',
   'Twelve hours on bar bending schedules, lap lengths and detailing to ES EN. Worked examples from Ethiopian projects, with the spreadsheets used in each one.',
   2400, 'ETB', 'digital', 'course', 'MP4 + PDF', 4800.00, 'personal',
   'in_stock', 'published', true, false, 'new'),

  ('d5100000-0000-4000-8000-000000000002',
   'd5000000-0000-4000-8000-000000000001',
   'Fitted wardrobe library — SketchUp components',
   'sample-wardrobe-sketchup-library',
   'Forty parametric wardrobe components with correct carcass thicknesses and hardware placement. Drop them into a room and they resize.',
   1800, 'ETB', 'digital', 'sketchup', 'SKP', 320.00, 'commercial',
   'in_stock', 'published', true, false, 'new'),

  ('d5100000-0000-4000-8000-000000000003',
   'd5000000-0000-4000-8000-000000000001',
   'Kitchen appliances — 3D model pack',
   'sample-kitchen-appliance-3d-pack',
   'Sixty appliance models at the sizes sold in Addis, so a kitchen laid out around them still fits when the units arrive.',
   1200, 'ETB', 'digital', 'model_3d', 'FBX + OBJ + BLEND', 780.00, 'commercial',
   'in_stock', 'published', true, false, 'new'),

  ('d5100000-0000-4000-8000-000000000004',
   'd5000000-0000-4000-8000-000000000001',
   'G+1 villa floor plan — 180 m² on a 10×20 plot',
   'sample-g1-villa-floor-plan',
   'Dimensioned plans, elevations and sections for a three-bedroom G+1 on a standard 200 m² plot. DWG to edit and PDF to print.',
   3500, 'ETB', 'digital', 'floor_plan', 'DWG + PDF', 46.00, 'personal',
   'in_stock', 'published', true, false, 'new'),

  ('d5100000-0000-4000-8000-000000000005',
   'd5000000-0000-4000-8000-000000000001',
   'BOQ and cash-flow template — Excel',
   'sample-boq-cashflow-template',
   'A bill of quantities that totals itself, with a monthly cash-flow sheet driven from the programme. Ethiopian VAT and retention already in the formulas.',
   900, 'ETB', 'digital', 'other', 'XLSX', 2.40, 'commercial',
   'in_stock', 'published', true, false, 'new')
on conflict (id) do nothing;

-- Registered so a later run can remove exactly these and nothing else.
insert into public.seed_content (entity, entity_id, batch)
select 'products', id, 'digital_samples_0075'
from public.products
where is_sample and owner_id = 'd5000000-0000-4000-8000-000000000001'
on conflict (entity, entity_id) do nothing;

-- To remove them:
--
--   begin;
--   delete from public.products
--    where id in (select entity_id from public.seed_content
--                  where batch = 'digital_samples_0075' and entity = 'products');
--   delete from auth.users where id = 'd5000000-0000-4000-8000-000000000001';
--   delete from public.seed_content where batch = 'digital_samples_0075';
--   commit;
