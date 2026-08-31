-- ---------------------------------------------------------------------------
-- Somewhere for Medosha AI's images to live
-- ---------------------------------------------------------------------------
--
-- Until now they did not live anywhere. The studio's history is localStorage
-- and it holds *provider URLs* — which was survivable while providers returned
-- hosted links, and stopped being survivable the moment xAI became the image
-- provider.
--
-- xAI's hosted URLs expire, so Medosha asks it for base64 instead. That fixed
-- the expiry and broke persistence: `image-history.ts` refuses to write data
-- URLs to localStorage, and rightly — a handful of them would blow the five
-- megabyte quota and take the entire history with them. So a generated image
-- now survives until the tab is reloaded and not one second longer.
--
-- This is the missing half. The bytes go in a bucket, the history keeps a path,
-- and the picture is still there tomorrow.
--
-- ## Private, unlike `designs`
--
-- The `designs` bucket is public because a published design is a link somebody
-- sends to a joiner. This is the opposite: it holds the photograph a member
-- uploaded of their own half-built house, and the renders made from it. Those
-- are theirs. Public-with-an-unguessable-name is not a permission model, and
-- the whole point of a per-member folder is lost if anyone who learns the URL
-- can read it.
--
-- Reading is therefore through a signed URL, minted for the member who owns the
-- folder. What is *stored* in the history is the path, which never expires, so
-- the signed URL being short-lived costs nothing.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ai-images',
  'ai-images',
  false,
  -- 20 MB. A 1024×1024 JPEG is a few hundred kilobytes; the headroom is for
  -- the source photographs members upload straight off a phone.
  20971520,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Every object lives under the owner's user id. That prefix is the whole of the
-- access control, so every policy below checks it and none of them can be
-- satisfied by knowing a filename.

create policy "members read their own AI images"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'ai-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "members write into their own AI folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'ai-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "members replace their own AI images"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'ai-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'ai-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "members delete their own AI images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'ai-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
