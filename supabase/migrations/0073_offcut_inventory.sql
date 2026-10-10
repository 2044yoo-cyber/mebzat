-- Persistent, owner-scoped offcut inventory for Berchuma Studio.
-- Offcuts are physical remnants, not derived design geometry; users can edit
-- their measured dimensions after checking the actual piece in the workshop.

begin;

create table if not exists public.offcut_inventory (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_design_id uuid references public.designs(id) on delete set null,
  source_sheet_number integer,
  board_id text,
  board_label text not null,
  thickness_mm numeric(10, 2) not null check (thickness_mm > 0),
  length_mm numeric(10, 2) not null check (length_mm > 0),
  width_mm numeric(10, 2) not null check (width_mm > 0),
  quantity integer not null default 1 check (quantity > 0),
  status text not null default 'available'
    check (status in ('available', 'reserved', 'used', 'discarded')),
  location text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists offcut_inventory_owner_status_created_idx
  on public.offcut_inventory (owner_id, status, created_at desc);

create index if not exists offcut_inventory_stock_lookup_idx
  on public.offcut_inventory (owner_id, board_id, thickness_mm, length_mm, width_mm)
  where status = 'available';

alter table public.offcut_inventory enable row level security;

drop policy if exists "Owners can read their offcuts" on public.offcut_inventory;
create policy "Owners can read their offcuts"
  on public.offcut_inventory for select
  using (owner_id = (select auth.uid()));

drop policy if exists "Owners can add their offcuts" on public.offcut_inventory;
create policy "Owners can add their offcuts"
  on public.offcut_inventory for insert
  with check (owner_id = (select auth.uid()));

drop policy if exists "Owners can update their offcuts" on public.offcut_inventory;
create policy "Owners can update their offcuts"
  on public.offcut_inventory for update
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "Owners can delete their offcuts" on public.offcut_inventory;
create policy "Owners can delete their offcuts"
  on public.offcut_inventory for delete
  using (owner_id = (select auth.uid()));

comment on table public.offcut_inventory is
  'Measured, reusable board remnants tracked across Berchuma Studio projects.';

commit;
