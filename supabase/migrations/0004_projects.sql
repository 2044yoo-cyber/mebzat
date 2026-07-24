-- Project Showcase: professionals publish projects with images, shown on
-- their public profile and (later) the marketplace/homepage galleries.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.project_status as enum ('draft', 'published');

create type public.building_type as enum (
  'residential',
  'commercial',
  'industrial',
  'hospitality',
  'institutional',
  'mixed_use',
  'landscape',
  'interior',
  'renovation',
  'other'
);

-- ---------------------------------------------------------------------------
-- projects
-- owner_id references the profile (which is 1:1 with auth.users).
-- ---------------------------------------------------------------------------

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  slug text not null,
  description text,
  location_city text,
  location_country text,
  building_type public.building_type,
  style text,
  bedrooms smallint,
  floors smallint,
  budget numeric(14, 2),
  budget_currency text not null default 'USD',
  materials text[] not null default '{}',
  completion_date date,
  client text,
  cover_image_url text,
  status public.project_status not null default 'published',
  views integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint projects_owner_slug_unique unique (owner_id, slug),
  constraint projects_title_length check (char_length(title) between 2 and 160),
  constraint projects_bedrooms_range check (bedrooms is null or bedrooms between 0 and 100),
  constraint projects_floors_range check (floors is null or floors between 0 and 300),
  constraint projects_budget_positive check (budget is null or budget >= 0)
);

comment on table public.projects is 'Portfolio projects published by professionals.';

create index projects_owner_id_idx on public.projects (owner_id);
create index projects_status_idx on public.projects (status);
create index projects_building_type_idx on public.projects (building_type);
create index projects_created_at_idx on public.projects (created_at desc);

-- ---------------------------------------------------------------------------
-- project_images
-- ---------------------------------------------------------------------------

create table public.project_images (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  url text not null,
  caption text,
  position smallint not null default 0,
  created_at timestamptz not null default now()
);

create index project_images_project_id_idx on public.project_images (project_id, position);

-- ---------------------------------------------------------------------------
-- updated_at maintenance (reuses public.set_updated_at from 0001)
-- ---------------------------------------------------------------------------

create trigger projects_set_updated_at
  before update on public.projects
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Published projects are world-readable; drafts and all writes are
-- owner-only. project_images inherit visibility from their parent project.
-- ---------------------------------------------------------------------------

alter table public.projects enable row level security;

create policy "Published projects are viewable by everyone"
  on public.projects for select
  to authenticated, anon
  using (status = 'published' or auth.uid() = owner_id);

create policy "Users can insert their own projects"
  on public.projects for insert
  to authenticated
  with check (auth.uid() = owner_id);

create policy "Users can update their own projects"
  on public.projects for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "Users can delete their own projects"
  on public.projects for delete
  to authenticated
  using (auth.uid() = owner_id);

alter table public.project_images enable row level security;

create policy "Project images follow project visibility"
  on public.project_images for select
  to authenticated, anon
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and (p.status = 'published' or p.owner_id = auth.uid())
    )
  );

create policy "Users can insert images on their own projects"
  on public.project_images for insert
  to authenticated
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_id and p.owner_id = auth.uid()
    )
  );

create policy "Users can update images on their own projects"
  on public.project_images for update
  to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_id and p.owner_id = auth.uid()
    )
  );

create policy "Users can delete images on their own projects"
  on public.project_images for delete
  to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_id and p.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- View counter (mirrors increment_profile_views from 0003)
-- ---------------------------------------------------------------------------

create function public.increment_project_views(project_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.projects
  set views = views + 1
  where id = project_id;
end;
$$;

grant execute on function public.increment_project_views(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage: project images
-- Path convention: project-images/{user_id}/{project_id}/{filename}.
-- Public read, owner-only write.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-images',
  'project-images',
  true,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp']
);

create policy "Project images are publicly accessible"
  on storage.objects for select
  to authenticated, anon
  using (bucket_id = 'project-images');

create policy "Users can upload their own project images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'project-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can update their own project images"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'project-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete their own project images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'project-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
