create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";
create extension if not exists pg_trgm;
create extension if not exists unaccent;

do $$ begin
  create role anon nologin noinherit;
exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated nologin noinherit;
exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role nologin noinherit bypassrls;
exception when duplicate_object then null; end $$;
do $$ begin
  create role supabase_auth_admin nologin noinherit;
exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticator noinherit login;
exception when duplicate_object then null; end $$;
grant anon, authenticated, service_role to authenticator;
grant usage on schema public to anon, authenticated, service_role;

create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  raw_app_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  encrypted_password text,
  confirmed_at timestamptz,
  phone text,
  phone_confirmed_at timestamptz
);

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), current_user)
$$;
create or replace function auth.email() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.email', true), '')
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now()
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  metadata jsonb,
  path_tokens text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.objects to anon, authenticated, service_role;
grant all on storage.buckets to anon, authenticated, service_role;

create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$ select string_to_array(name, '/') $$;

-- Supabase grants table privileges to anon/authenticated by default; RLS, not
-- GRANT, is what its policies rely on. Without this the tests fail on
-- "permission denied" before a policy is ever consulted.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;
