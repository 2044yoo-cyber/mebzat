-- Phase 1: authentication, onboarding, and the profile shell.
-- Apply in the Supabase SQL Editor, or via `supabase db push` once the
-- project is linked with the Supabase CLI.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.account_type as enum (
  'individual',
  'company',
  'supplier',
  'manufacturer',
  'contractor',
  'developer',
  'government',
  'university',
  'student'
);

create type public.verification_status as enum (
  'unverified',
  'pending',
  'verified'
);

-- ---------------------------------------------------------------------------
-- profiles
-- One row per auth.users row. account_type is nullable until the user
-- completes onboarding; onboarding_completed gates access to the app.
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  account_type public.account_type,
  username text unique,
  full_name text,
  company_name text,
  email text not null,
  phone text,
  phone_verified boolean not null default false,
  avatar_url text,
  cover_url text,
  bio text,
  website text,
  location_city text,
  location_country text,
  latitude double precision,
  longitude double precision,
  years_experience smallint,
  languages text[] not null default '{}',
  verification_status public.verification_status not null default 'unverified',
  onboarding_completed boolean not null default false,
  onboarding_step smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint username_format check (
    username is null or username ~ '^[a-z0-9](?:[a-z0-9_-]{1,28}[a-z0-9])?$'
  ),
  constraint years_experience_range check (
    years_experience is null or years_experience between 0 and 80
  )
);

comment on table public.profiles is 'One row per authenticated user; extends auth.users with public profile data.';

create index profiles_account_type_idx on public.profiles (account_type);
create index profiles_username_idx on public.profiles (username);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Auto-create a profile row whenever a new auth.users row is created.
-- Runs as the function owner (security definer) because the auth trigger
-- context has no row-level access to public.profiles otherwise.
-- ---------------------------------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Profiles are public (LinkedIn-style directory), but only the owner may
-- write to their own row.
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;

create policy "Profiles are viewable by everyone"
  on public.profiles for select
  to authenticated, anon
  using (true);

create policy "Users can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Users can delete their own profile"
  on public.profiles for delete
  to authenticated
  using (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- Storage: avatars & cover photos
-- Path convention: {bucket}/{user_id}/{filename}. Public read, owner-only write.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 5242880, array['image/png', 'image/jpeg', 'image/webp']),
  ('covers', 'covers', true, 8388608, array['image/png', 'image/jpeg', 'image/webp']);

create policy "Avatar images are publicly accessible"
  on storage.objects for select
  to authenticated, anon
  using (bucket_id = 'avatars');

create policy "Users can upload their own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can update their own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete their own avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Cover images are publicly accessible"
  on storage.objects for select
  to authenticated, anon
  using (bucket_id = 'covers');

create policy "Users can upload their own cover"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can update their own cover"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete their own cover"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
