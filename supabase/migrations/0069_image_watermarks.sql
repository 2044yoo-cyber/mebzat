-- ---------------------------------------------------------------------------
-- Image watermarking
-- ---------------------------------------------------------------------------
--
-- Photographs of finished work are the main thing a builder on Medosha has to
-- sell, and they are lifted constantly — reposted by other contractors as
-- their own. A watermark drawn in the browser does not help with that: the
-- file behind the CSS is clean and one right-click gets it. So the mark is
-- burned into the pixels server-side, on the way from quarantine to a public
-- bucket, and the unmarked original is kept privately for its owner.
--
-- This migration adds the settings that decide what the mark says, the private
-- bucket the originals go to, and the column that remembers where each
-- original went.

-- ---------------------------------------------------------------------------
-- Vocabulary
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'watermark_position') then
    create type public.watermark_position as enum (
      'bottom_right',
      'bottom_left',
      'top_right',
      'top_left',
      'center',
      'tiled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'watermark_size') then
    create type public.watermark_size as enum ('small', 'medium', 'large');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------

-- A separate table rather than more columns on `profiles`. Profiles is read on
-- nearly every page and is already wide; these are read once, by one server
-- function, at upload time.
create table if not exists public.watermark_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,

  enabled boolean not null default true,

  -- What the mark says. Composable rather than a single enum, because the
  -- brief's "combination" is the common case: a name under a logo.
  use_username boolean not null default true,
  use_display_name boolean not null default false,
  use_company boolean not null default false,
  use_logo boolean not null default true,

  -- Off, and it stays off until somebody deliberately turns it on. A phone
  -- number burned into a photograph cannot be taken back out of the copies
  -- that have already spread, so this is never a default and never implied by
  -- any other setting.
  use_phone boolean not null default false,

  position public.watermark_position not null default 'bottom_right',
  size public.watermark_size not null default 'medium',

  -- Percent. Floored well above invisible and capped well below opaque: a mark
  -- nobody can see protects nothing, and one at full strength ruins the
  -- photograph it is meant to be advertising.
  opacity smallint not null default 45 check (opacity between 15 and 80),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger watermark_settings_set_updated_at
  before update on public.watermark_settings
  for each row
  execute function public.set_updated_at();

alter table public.watermark_settings enable row level security;

-- Own row only, in every direction. There is nothing here anybody else needs:
-- the mark is visible on the image itself, so reading a stranger's settings
-- would only reveal whether they have chosen to publish their phone number.
drop policy if exists "members read their own watermark settings" on public.watermark_settings;
create policy "members read their own watermark settings"
  on public.watermark_settings for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "members create their own watermark settings" on public.watermark_settings;
create policy "members create their own watermark settings"
  on public.watermark_settings for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "members update their own watermark settings" on public.watermark_settings;
create policy "members update their own watermark settings"
  on public.watermark_settings for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "members delete their own watermark settings" on public.watermark_settings;
create policy "members delete their own watermark settings"
  on public.watermark_settings for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Originals
-- ---------------------------------------------------------------------------

-- Private, and the only copy of the unmarked file once publishing is done.
-- Before this the quarantine copy was deleted after approval, which was right
-- when the public file *was* the upload; now that the public file has been
-- altered, throwing the original away would mean the person who took the
-- photograph no longer has it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'image-originals',
  'image-originals',
  false,
  26214400,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Folder-scoped to the uploader, same shape as quarantine: the path's first
-- segment is the owner's id, so a member reads their own originals and nobody
-- else's. There is deliberately no public read policy — a readable original
-- would make the watermark decorative.
drop policy if exists "members read their own originals" on storage.objects;
create policy "members read their own originals"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'image-originals'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "members write their own originals" on storage.objects;
create policy "members write their own originals"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'image-originals'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "members delete their own originals" on storage.objects;
create policy "members delete their own originals"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'image-originals'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- A takedown or an appeal is argued about the image as it was uploaded, not
-- the marked copy, so moderators can reach it.
drop policy if exists "moderators read originals" on storage.objects;
create policy "moderators read originals"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'image-originals'
    and public.is_moderator()
  );

-- ---------------------------------------------------------------------------
-- The record
-- ---------------------------------------------------------------------------

-- Where the unmarked file went, and whether the published one carries a mark.
-- Regenerating marks after a settings change is not something this migration
-- does — the brief is explicit that history is left alone — but it cannot be
-- done later at all without knowing which originals exist.
alter table public.moderation_items
  add column if not exists original_path text,
  add column if not exists watermarked boolean not null default false;

-- An original is only ever kept for something that was published, and only
-- when it differs from what was published.
alter table public.moderation_items
  drop constraint if exists original_path_requires_watermark;
alter table public.moderation_items
  add constraint original_path_requires_watermark check (
    original_path is null or (watermarked and public_path is not null)
  );
