-- Phase 2: Companies + Business Import. Businesses can exist WITHOUT a user
-- account (imported, unclaimed). An owner later registers and claims the
-- business; once verified it becomes claimed and owner-manageable. Imported
-- provenance (import_source / external_ref) is kept on the row so imported
-- data stays separate from owner-managed edits and reimports are idempotent.
-- Additive only — no existing table is altered.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.claim_status as enum ('pending', 'approved', 'rejected');

-- ---------------------------------------------------------------------------
-- companies
-- owner_id is null while unclaimed; set to the claiming profile once verified.
-- ---------------------------------------------------------------------------

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  category text,
  description text,
  logo_url text,
  cover_url text,
  website text,
  email text,
  phone text,
  address text,
  city text,
  country text,
  latitude double precision,
  longitude double precision,
  employees_count integer,
  projects_completed integer not null default 0,
  followers_count integer not null default 0,
  rating numeric(2, 1),
  verified boolean not null default false,
  is_claimed boolean not null default false,
  owner_id uuid references public.profiles (id) on delete set null,
  -- Provenance. import_source is null for user-created companies, otherwise a
  -- source tag like 'seed' or 'import:addis-open-data'. external_ref is the
  -- stable id from that source so a reimport updates rather than duplicates.
  import_source text,
  external_ref text,
  views integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint companies_name_length check (char_length(name) between 2 and 160),
  constraint companies_rating_range check (rating is null or rating between 0 and 5),
  constraint companies_source_ref_unique unique (import_source, external_ref)
);

comment on table public.companies is 'Business listings; may be imported/unclaimed or user-owned once claimed.';

create index companies_owner_id_idx on public.companies (owner_id);
create index companies_is_claimed_idx on public.companies (is_claimed);
create index companies_city_idx on public.companies (city);
create index companies_created_at_idx on public.companies (created_at desc);
create index companies_search_idx on public.companies using gin (
  to_tsvector(
    'simple',
    coalesce(name, '') || ' ' || coalesce(category, '') || ' ' || coalesce(city, '')
  )
);

-- ---------------------------------------------------------------------------
-- company_claims
-- A user's request to claim an unclaimed business.
-- ---------------------------------------------------------------------------

create table public.company_claims (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  claimant_id uuid not null references public.profiles (id) on delete cascade,
  status public.claim_status not null default 'pending',
  role_at_company text,
  contact_email text,
  contact_phone text,
  message text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,

  constraint company_claims_unique unique (company_id, claimant_id)
);

create index company_claims_company_id_idx on public.company_claims (company_id);
create index company_claims_claimant_id_idx on public.company_claims (claimant_id);
create index company_claims_status_idx on public.company_claims (status);

-- ---------------------------------------------------------------------------
-- updated_at maintenance (reuses public.set_updated_at from 0001)
-- ---------------------------------------------------------------------------

create trigger companies_set_updated_at
  before update on public.companies
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Companies are a public directory. Only the owner (a claimed company) may
-- edit; unclaimed/imported rows have no owner and so are read-only to users
-- until claimed. Inserts come from the importer (service role, bypasses RLS)
-- or an authenticated user creating a company they own.
-- ---------------------------------------------------------------------------

alter table public.companies enable row level security;

create policy "Companies are viewable by everyone"
  on public.companies for select
  to authenticated, anon
  using (true);

create policy "Users can create companies they own"
  on public.companies for insert
  to authenticated
  with check (auth.uid() = owner_id and is_claimed = true);

create policy "Owners can update their company"
  on public.companies for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "Owners can delete their company"
  on public.companies for delete
  to authenticated
  using (auth.uid() = owner_id);

alter table public.company_claims enable row level security;

create policy "Users can view their own claims"
  on public.company_claims for select
  to authenticated
  using (auth.uid() = claimant_id);

create policy "Users can submit claims on unclaimed companies"
  on public.company_claims for insert
  to authenticated
  with check (
    auth.uid() = claimant_id
    and exists (
      select 1 from public.companies c
      where c.id = company_id and c.is_claimed = false
    )
  );

-- ---------------------------------------------------------------------------
-- Claim approval (admin / service-role only).
-- Grants ownership of the business to the claimant and marks it claimed.
-- Runs as owner (security definer) so it can update rows the caller's RLS
-- would otherwise block. Execute is granted to service_role only.
-- ---------------------------------------------------------------------------

create function public.approve_company_claim(claim_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company uuid;
  v_claimant uuid;
begin
  select company_id, claimant_id into v_company, v_claimant
  from public.company_claims
  where id = claim_id and status = 'pending';

  if v_company is null then
    raise exception 'Claim % not found or already decided', claim_id;
  end if;

  update public.companies
  set owner_id = v_claimant,
      is_claimed = true,
      verified = true
  where id = v_company;

  update public.company_claims
  set status = 'approved', decided_at = now()
  where id = claim_id;

  -- Reject any other pending claims for the same company.
  update public.company_claims
  set status = 'rejected', decided_at = now()
  where company_id = v_company and id <> claim_id and status = 'pending';
end;
$$;

revoke execute on function public.approve_company_claim(uuid) from anon, authenticated;
grant execute on function public.approve_company_claim(uuid) to service_role;

create function public.increment_company_views(company_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.companies
  set views = views + 1
  where id = company_id;
end;
$$;

grant execute on function public.increment_company_views(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage: company logos & covers (owner-managed after claim).
-- Path convention: company-assets/{user_id}/{filename}. Public read,
-- owner-only write.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'company-assets',
  'company-assets',
  true,
  8388608,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
);

create policy "Company assets are publicly accessible"
  on storage.objects for select
  to authenticated, anon
  using (bucket_id = 'company-assets');

create policy "Users can upload their own company assets"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'company-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can update their own company assets"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'company-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete their own company assets"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'company-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
