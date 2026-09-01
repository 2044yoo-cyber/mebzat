-- Somewhere to put a listing's photos.
--
-- `property_media` has existed since 0017 and nothing has ever written to it.
-- The listing form compresses photos in the browser, scores them, shows them
-- back — and then holds them as Blobs in React state, which the page discards
-- on navigation. There was no bucket to upload them to, so "Photos: 1" on the
-- review step was true of the browser and of nothing else.
--
-- Every other image feature in Medosha already works this way (avatars,
-- covers, project-images, product-images), so this is the same shape as 0004
-- rather than a new idea: public read, and a write confined to a folder named
-- after the uploader.
--
-- Additive. Creates one bucket and its policies. Nothing existing changes.
--
-- Run after 0044.

begin;

-- ---------------------------------------------------------------------------
-- The bucket
--
-- Path convention: property-images/{user_id}/{property_id}/{filename}, which
-- is what the insert policy below relies on — the first folder segment is the
-- owner, so a signed-in member can only write beneath their own id.
--
-- 10 MB and three formats, matching project-images. The uploader already
-- compresses to well under this; the limit is a backstop against a client that
-- does not.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'property-images',
  'property-images',
  true,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Policies
--
-- `do` blocks because `create policy` has no `if not exists`, and this file
-- must be safe to run twice — the whole point of a bucket migration is that
-- somebody applies it after wondering whether they already had.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Property images are publicly accessible'
  ) then
    create policy "Property images are publicly accessible"
      on storage.objects for select
      to authenticated, anon
      using (bucket_id = 'property-images');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Users can upload their own property images'
  ) then
    create policy "Users can upload their own property images"
      on storage.objects for insert
      to authenticated
      with check (
        bucket_id = 'property-images'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Users can update their own property images'
  ) then
    create policy "Users can update their own property images"
      on storage.objects for update
      to authenticated
      using (
        bucket_id = 'property-images'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  -- Deletion matters here in a way it does not for an avatar: a listing that
  -- fails to save should not leave its photos behind, and the only client that
  -- can tidy them up is the one that uploaded them.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Users can delete their own property images'
  ) then
    create policy "Users can delete their own property images"
      on storage.objects for delete
      to authenticated
      using (
        bucket_id = 'property-images'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end
$$;

commit;
