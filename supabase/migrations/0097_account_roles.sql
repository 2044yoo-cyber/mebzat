-- How somebody uses Medosha, as distinct from what kind of thing they are.
--
-- `profiles.account_type` has existed since 0001 and answers a different
-- question: individual, company, supplier, manufacturer, government,
-- university, student. That is *what the account is*, and four search
-- functions read it — 0013, 0020, 0035 and 0073 all put it in a result row.
-- Overloading it with "client" and "agent" would change what those searches
-- say about every existing account, and it could not hold two answers at once.
--
-- So this is a second, orthogonal column. `account_type` keeps meaning what it
-- meant; `roles` says how the person intends to use the platform.
--
-- ## An array from the start
--
-- One role would have been less to write and would have had to be undone: an
-- architect who also sells fittings, an agent who is also a contractor. The
-- brief asks for the door to be left open, and a `text[]` with a GIN index
-- leaves it open at no cost today — `roles @> '{professional}'` is the same
-- query whether somebody has one role or three.
--
-- `primary_role` is which one the account leads with, for a screen that has
-- room for one word.
--
-- ## Nobody existing is asked anything
--
-- Every profile that exists before this migration is marked onboarded, with a
-- role inferred from what it already says. An account that has been used for a
-- year must not be stopped at a question it has effectively already answered,
-- and inferring is how that is avoided without losing the answer.

begin;

create type public.medosha_role as enum (
  'client',
  'professional',
  'company',
  'agent',
  'seller'
);

alter table public.profiles
  add column if not exists roles public.medosha_role[] not null default '{}',
  add column if not exists primary_role public.medosha_role;

comment on column public.profiles.roles is
  'How this account uses Medosha. Orthogonal to account_type, which says what kind of entity it is. An array so a second role never needs a migration.';
comment on column public.profiles.primary_role is
  'The role the account leads with, for a screen with room for one word. Always also present in roles.';

create index if not exists profiles_roles_idx on public.profiles using gin (roles);

-- ---------------------------------------------------------------------------
-- The backfill
-- ---------------------------------------------------------------------------
--
-- Inferred from what the profile already says, in the order a person would
-- read it: somebody with a trade is a professional, an organisation is a
-- company or a seller depending on which kind, and everybody else is a client.
-- Nobody is asked again.

update public.profiles
set
  roles = array[
    case
      when profession is not null and length(trim(profession)) > 0
        then 'professional'::public.medosha_role
      when account_type in ('supplier', 'manufacturer')
        then 'seller'::public.medosha_role
      when account_type in ('company', 'contractor', 'developer', 'government', 'university')
        then 'company'::public.medosha_role
      else 'client'::public.medosha_role
    end
  ],
  primary_role = case
    when profession is not null and length(trim(profession)) > 0
      then 'professional'::public.medosha_role
    when account_type in ('supplier', 'manufacturer')
      then 'seller'::public.medosha_role
    when account_type in ('company', 'contractor', 'developer', 'government', 'university')
      then 'company'::public.medosha_role
    else 'client'::public.medosha_role
  end,
  -- The question is answered for them. `onboarding_completed` is what the
  -- welcome screen checks, and leaving it false would stop a year-old account
  -- at a form it does not need.
  onboarding_completed = true
where cardinality(roles) = 0;

-- ---------------------------------------------------------------------------
-- The agent profile
-- ---------------------------------------------------------------------------
--
-- Its own table rather than more columns on `profiles`, because an agent is
-- not a professional and must not be asked for a trade, years of experience or
-- a service category to be complete. Property listings are not repeated here:
-- `properties.owner_id` already points at the profile.

create table if not exists public.agent_profiles (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  agency_name text,
  license_number text,
  -- Free text rather than an enum: "Sales", "Rentals", "Commercial leasing"
  -- and "Land" are all real and the list grows.
  specialisations text[] not null default '{}',
  years_experience smallint check (years_experience is null or years_experience between 0 and 80),
  contact_phone text,
  contact_email text,
  about text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Where an agent works, in the same shape `professional_service_areas` uses so
-- one areas picker serves both and the area name survives a rename.
create table if not exists public.agent_service_areas (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  area_slug text not null,
  area_name text not null,
  city text not null default 'Addis Ababa',
  country text not null default 'Ethiopia',
  created_at timestamptz not null default now(),
  constraint agent_service_areas_unique unique (profile_id, area_slug, city)
);

create index if not exists agent_service_areas_lookup_idx
  on public.agent_service_areas (area_slug, city);

-- ---------------------------------------------------------------------------
-- The seller profile
-- ---------------------------------------------------------------------------
--
-- Same reasoning. A hardware shop has a store name and a delivery radius, and
-- has no years of experience as a person. `products.owner_id` already links
-- the catalogue, so nothing about stock lives here.

create table if not exists public.seller_profiles (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  store_name text,
  -- `product_categories.slug`, denormalised as text so a category renamed
  -- later does not silently empty somebody's shopfront.
  category_slugs text[] not null default '{}',
  contact_phone text,
  contact_email text,
  about text,
  delivers boolean not null default false,
  delivery_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.seller_service_areas (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  area_slug text not null,
  area_name text not null,
  city text not null default 'Addis Ababa',
  country text not null default 'Ethiopia',
  created_at timestamptz not null default now(),
  constraint seller_service_areas_unique unique (profile_id, area_slug, city)
);

create index if not exists seller_service_areas_lookup_idx
  on public.seller_service_areas (area_slug, city);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
--
-- Both profiles are public to read, which is the point of them: an agent and a
-- shop exist to be found, exactly as a professional's profile already is.
-- Writing is the owner's alone — including the anon role in the read grant, so
-- somebody arriving from a shared link sees the shop without an account.

do $$
declare
  t text;
begin
  foreach t in array array[
    'agent_profiles', 'agent_service_areas',
    'seller_profiles', 'seller_service_areas'
  ] loop
    execute format('alter table public.%I enable row level security', t);

    execute format($f$
      drop policy if exists "%1$s are public" on public.%1$I;
      create policy "%1$s are public" on public.%1$I
        for select to anon, authenticated using (true);
    $f$, t);

    execute format($f$
      drop policy if exists "%1$s: owner writes" on public.%1$I;
      create policy "%1$s: owner writes" on public.%1$I
        for insert to authenticated with check (profile_id = auth.uid());

      drop policy if exists "%1$s: owner updates" on public.%1$I;
      create policy "%1$s: owner updates" on public.%1$I
        for update to authenticated
        using (profile_id = auth.uid())
        with check (profile_id = auth.uid());

      drop policy if exists "%1$s: owner removes" on public.%1$I;
      create policy "%1$s: owner removes" on public.%1$I
        for delete to authenticated using (profile_id = auth.uid());
    $f$, t);
  end loop;
end;
$$;

-- An area row is removed and re-added when somebody edits where they work,
-- which is why these two get a delete policy and the profile tables' own rows
-- are only ever updated.

do $$
declare t text;
begin
  foreach t in array array['agent_profiles', 'seller_profiles'] loop
    execute format('drop trigger if exists touch_row on public.%I', t);
    execute format(
      'create trigger touch_row before update on public.%I '
      || 'for each row execute function public.touch_updated_at()', t);
  end loop;
end;
$$;

commit;
