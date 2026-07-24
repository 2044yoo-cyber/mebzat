-- Phase 2: Marketplace. Suppliers publish products organised by category;
-- users browse, view, and save (favorite) them. Additive only — no existing
-- table is altered.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.product_status as enum ('draft', 'published');

create type public.stock_status as enum (
  'in_stock',
  'made_to_order',
  'out_of_stock'
);

-- ---------------------------------------------------------------------------
-- product_categories (seeded reference data; world-readable, no user writes)
-- ---------------------------------------------------------------------------

create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  icon text,
  position smallint not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.product_categories is 'Marketplace product categories (reference data).';

insert into public.product_categories (slug, name, icon, position) values
  ('furniture', 'Furniture', 'Armchair', 1),
  ('kitchen', 'Kitchen', 'CookingPot', 2),
  ('bathroom', 'Bathroom', 'ShowerHead', 3),
  ('lighting', 'Lighting', 'Lightbulb', 4),
  ('doors', 'Doors', 'DoorOpen', 5),
  ('windows', 'Windows', 'Grid2x2', 6),
  ('roofing', 'Roofing', 'House', 7),
  ('paint', 'Paint', 'PaintRoller', 8),
  ('flooring', 'Flooring', 'Grid3x3', 9),
  ('electrical', 'Electrical', 'Zap', 10),
  ('construction-materials', 'Construction Materials', 'Package', 11);

-- ---------------------------------------------------------------------------
-- products
-- owner_id references the supplier's profile (1:1 with auth.users).
-- ---------------------------------------------------------------------------

create table public.products (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  category_id uuid references public.product_categories (id) on delete set null,
  title text not null,
  slug text not null,
  description text,
  brand text,
  price numeric(14, 2),
  currency text not null default 'USD',
  unit text,
  stock_status public.stock_status not null default 'in_stock',
  specs jsonb not null default '{}'::jsonb,
  location_city text,
  location_country text,
  delivery_available boolean not null default false,
  cover_image_url text,
  status public.product_status not null default 'published',
  views integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint products_owner_slug_unique unique (owner_id, slug),
  constraint products_title_length check (char_length(title) between 2 and 160),
  constraint products_price_positive check (price is null or price >= 0)
);

comment on table public.products is 'Marketplace products published by suppliers.';

create index products_owner_id_idx on public.products (owner_id);
create index products_category_id_idx on public.products (category_id);
create index products_status_idx on public.products (status);
create index products_created_at_idx on public.products (created_at desc);
create index products_price_idx on public.products (price);
-- Full-text search over title + brand + description.
create index products_search_idx on public.products using gin (
  to_tsvector(
    'simple',
    coalesce(title, '') || ' ' || coalesce(brand, '') || ' ' || coalesce(description, '')
  )
);

-- ---------------------------------------------------------------------------
-- product_images
-- ---------------------------------------------------------------------------

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  url text not null,
  caption text,
  position smallint not null default 0,
  created_at timestamptz not null default now()
);

create index product_images_product_id_idx on public.product_images (product_id, position);

-- ---------------------------------------------------------------------------
-- product_favorites (a user's saved products)
-- ---------------------------------------------------------------------------

create table public.product_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),

  constraint product_favorites_unique unique (user_id, product_id)
);

create index product_favorites_user_id_idx on public.product_favorites (user_id, created_at desc);
create index product_favorites_product_id_idx on public.product_favorites (product_id);

-- ---------------------------------------------------------------------------
-- updated_at maintenance (reuses public.set_updated_at from 0001)
-- ---------------------------------------------------------------------------

create trigger products_set_updated_at
  before update on public.products
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.product_categories enable row level security;

create policy "Product categories are viewable by everyone"
  on public.product_categories for select
  to authenticated, anon
  using (true);

alter table public.products enable row level security;

create policy "Published products are viewable by everyone"
  on public.products for select
  to authenticated, anon
  using (status = 'published' or auth.uid() = owner_id);

create policy "Users can insert their own products"
  on public.products for insert
  to authenticated
  with check (auth.uid() = owner_id);

create policy "Users can update their own products"
  on public.products for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "Users can delete their own products"
  on public.products for delete
  to authenticated
  using (auth.uid() = owner_id);

alter table public.product_images enable row level security;

create policy "Product images follow product visibility"
  on public.product_images for select
  to authenticated, anon
  using (
    exists (
      select 1 from public.products p
      where p.id = product_id
        and (p.status = 'published' or p.owner_id = auth.uid())
    )
  );

create policy "Users can insert images on their own products"
  on public.product_images for insert
  to authenticated
  with check (
    exists (
      select 1 from public.products p
      where p.id = product_id and p.owner_id = auth.uid()
    )
  );

create policy "Users can update images on their own products"
  on public.product_images for update
  to authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_id and p.owner_id = auth.uid()
    )
  );

create policy "Users can delete images on their own products"
  on public.product_images for delete
  to authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_id and p.owner_id = auth.uid()
    )
  );

alter table public.product_favorites enable row level security;

create policy "Users can view their own favorites"
  on public.product_favorites for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can add their own favorites"
  on public.product_favorites for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can remove their own favorites"
  on public.product_favorites for delete
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- View counter (mirrors increment_project_views from 0004)
-- ---------------------------------------------------------------------------

create function public.increment_product_views(product_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.products
  set views = views + 1
  where id = product_id;
end;
$$;

grant execute on function public.increment_product_views(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage: product images
-- Path convention: product-images/{user_id}/{filename}. Public read,
-- owner-only write.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp']
);

create policy "Product images are publicly accessible"
  on storage.objects for select
  to authenticated, anon
  using (bucket_id = 'product-images');

create policy "Users can upload their own product images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can update their own product images"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete their own product images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
