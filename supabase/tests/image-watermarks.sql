-- Watermark settings are private, and the phone number is never a default.
--
-- Run after applying 0069. Prints one line per check and rolls itself back.
--
-- As with the verification probe, the role matters: run as a superuser these
-- checks all pass without proving anything, because a superuser bypasses
-- row-level security entirely. `set role authenticated` is what makes the
-- policies the thing under test.

begin;

insert into auth.users (id, email) values
  ('f0000000-0000-4000-8000-000000000001', 'wm_owner@example.test'),
  ('f0000000-0000-4000-8000-000000000002', 'wm_other@example.test'),
  ('f0000000-0000-4000-8000-000000000003', 'wm_third@example.test')
on conflict (id) do nothing;

insert into public.profiles (id, username, full_name, phone) values
  ('f0000000-0000-4000-8000-000000000001', 'wm_owner', 'Watermark Owner', '+251900000011'),
  ('f0000000-0000-4000-8000-000000000002', 'wm_other', 'Watermark Other', '+251900000012'),
  ('f0000000-0000-4000-8000-000000000003', 'wm_third', 'Watermark Third', '+251900000013')
on conflict (id) do nothing;

-- ===================================================================
-- 1. The defaults. A row created with nothing but an id must not have
--    the phone number turned on.
-- ===================================================================
set role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';

insert into public.watermark_settings (user_id)
values ('f0000000-0000-4000-8000-000000000001');

do $$
declare row public.watermark_settings;
begin
  select * into row from public.watermark_settings
  where user_id = 'f0000000-0000-4000-8000-000000000001';

  if row.use_phone then
    raise exception 'FAIL 1a: use_phone defaults to true';
  end if;
  raise notice 'ok 1a: phone is off by default';

  if not row.use_username then
    raise exception 'FAIL 1b: use_username does not default to true';
  end if;
  raise notice 'ok 1b: username is on by default';

  if not row.use_logo then
    raise exception 'FAIL 1c: use_logo does not default to true';
  end if;
  raise notice 'ok 1c: logo is on by default';

  if not row.enabled then
    raise exception 'FAIL 1d: watermarking is off by default';
  end if;
  raise notice 'ok 1d: watermarking is on by default';

  if row.use_display_name or row.use_company then
    raise exception 'FAIL 1e: a name is drawn by default';
  end if;
  raise notice 'ok 1e: no name is drawn by default';

  if row.position <> 'bottom_right' or row.size <> 'medium' or row.opacity <> 45 then
    raise exception 'FAIL 1f: unexpected default placement (% % %)',
      row.position, row.size, row.opacity;
  end if;
  raise notice 'ok 1f: default placement is bottom right, medium, 45%%';
end;
$$;

-- ===================================================================
-- 2. Opacity is bounded. Invisible protects nothing; opaque ruins the
--    photograph.
-- ===================================================================
do $$
begin
  begin
    update public.watermark_settings set opacity = 5
    where user_id = 'f0000000-0000-4000-8000-000000000001';
    raise exception 'FAIL 2a: opacity 5 was accepted';
  exception
    when check_violation then raise notice 'ok 2a: opacity below 15 refused';
  end;

  begin
    update public.watermark_settings set opacity = 100
    where user_id = 'f0000000-0000-4000-8000-000000000001';
    raise exception 'FAIL 2b: opacity 100 was accepted';
  exception
    when check_violation then raise notice 'ok 2b: opacity above 80 refused';
  end;

  update public.watermark_settings set opacity = 60
  where user_id = 'f0000000-0000-4000-8000-000000000001';
  raise notice 'ok 2c: opacity within range accepted';
end;
$$;

-- ===================================================================
-- 3. Nobody else's settings. Whether somebody has chosen to publish
--    their phone number is their business.
--
--    A note on what these can and cannot prove. PostgreSQL applies the
--    SELECT policy both to the rows an UPDATE or DELETE reads and to
--    the row an UPDATE produces. With reading scoped to
--    `user_id = auth.uid()`, that one policy carries all four checks
--    below: a stranger's UPDATE and DELETE match nothing, and the
--    ownership transfer in 3f is refused, whatever the UPDATE and
--    DELETE policies happen to say. Widening those two alone therefore
--    changes no behaviour these checks can see — which was confirmed by
--    doing it, not assumed.
--
--    3f earns its place as the canary for the SELECT policy. If that
--    policy is ever widened for some reasonable-looking purpose, 3f is
--    what says that the widening also let a member hand their settings
--    row to an account that has none — with the phone number switched
--    on, on somebody else's photographs.
-- ===================================================================
do $$
declare seen integer;
begin
  -- Still acting as the owner: they see exactly one row, their own.
  select count(*) into seen from public.watermark_settings;
  if seen <> 1 then
    raise exception 'FAIL 3a: owner sees % rows, expected 1', seen;
  end if;
  raise notice 'ok 3a: owner sees only their own row';
end;
$$;

set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000002';

do $$
declare seen integer;
begin
  select count(*) into seen from public.watermark_settings
  where user_id = 'f0000000-0000-4000-8000-000000000001';
  if seen <> 0 then
    raise exception 'FAIL 3b: a stranger can read the owner''s settings';
  end if;
  raise notice 'ok 3b: a stranger reads nothing';

  update public.watermark_settings set use_phone = true
  where user_id = 'f0000000-0000-4000-8000-000000000001';
  get diagnostics seen = row_count;
  if seen <> 0 then
    raise exception 'FAIL 3c: a stranger turned on the owner''s phone watermark';
  end if;
  raise notice 'ok 3c: a stranger cannot change the owner''s settings';

  begin
    insert into public.watermark_settings (user_id, use_phone)
    values ('f0000000-0000-4000-8000-000000000001', true);
    raise exception 'FAIL 3d: a stranger created settings for somebody else';
  exception
    when insufficient_privilege then
      raise notice 'ok 3d: a stranger cannot create settings for somebody else';
  end;

  delete from public.watermark_settings
  where user_id = 'f0000000-0000-4000-8000-000000000001';
  get diagnostics seen = row_count;
  if seen <> 0 then
    raise exception 'FAIL 3e: a stranger deleted the owner''s settings';
  end if;
  raise notice 'ok 3e: a stranger cannot delete the owner''s settings';
end;
$$;

-- 3f. Ownership cannot be handed over. This is the reachable half of the
-- update policy: a member editing their own row must not be able to write
-- somebody else's id into it.
insert into public.watermark_settings (user_id, use_phone)
values ('f0000000-0000-4000-8000-000000000002', true);

do $$
begin
  update public.watermark_settings
  set user_id = 'f0000000-0000-4000-8000-000000000003'
  where user_id = 'f0000000-0000-4000-8000-000000000002';
exception
  when insufficient_privilege then null;
end;
$$;

-- Checked with the policies out of the way. Asking as the attacker would
-- answer "no row" whether the write was refused or succeeded, because the
-- read policy hides the row it has just been handed to somebody else.
reset role;

do $$
declare planted integer;
begin
  select count(*) into planted from public.watermark_settings
  where user_id = 'f0000000-0000-4000-8000-000000000003';
  if planted <> 0 then
    raise exception 'FAIL 3f: a member planted settings on another account';
  end if;
  raise notice 'ok 3f: settings cannot be reassigned to another account';
end;
$$;

set role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000002';

-- ===================================================================
-- 4. The originals bucket is private, and folder-scoped.
-- ===================================================================
reset role;

do $$
declare is_public boolean;
begin
  select public into is_public from storage.buckets where id = 'image-originals';
  if is_public is null then
    raise exception 'FAIL 4a: the image-originals bucket does not exist';
  end if;
  if is_public then
    raise exception 'FAIL 4a: image-originals is a public bucket';
  end if;
  raise notice 'ok 4a: image-originals is private';

  if exists (
    select 1 from pg_policies
    where tablename = 'objects'
      and qual ilike '%image-originals%'
      and roles::text[] @> array['anon']
  ) then
    raise exception 'FAIL 4b: anon has a policy on image-originals';
  end if;
  raise notice 'ok 4b: no anonymous policy on image-originals';
end;
$$;

insert into storage.objects (bucket_id, name)
values
  ('image-originals', 'f0000000-0000-4000-8000-000000000001/keep.jpg'),
  ('image-originals', 'f0000000-0000-4000-8000-000000000002/keep.jpg');

set role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000002';

do $$
declare seen integer;
begin
  select count(*) into seen from storage.objects
  where bucket_id = 'image-originals'
    and name like 'f0000000-0000-4000-8000-000000000001/%';
  if seen <> 0 then
    raise exception 'FAIL 4c: a stranger can read somebody else''s original';
  end if;
  raise notice 'ok 4c: a stranger cannot read somebody else''s original';

  select count(*) into seen from storage.objects
  where bucket_id = 'image-originals'
    and name like 'f0000000-0000-4000-8000-000000000002/%';
  if seen <> 1 then
    raise exception 'FAIL 4d: the owner cannot read their own original (% rows)', seen;
  end if;
  raise notice 'ok 4d: the owner reads their own original';

  begin
    insert into storage.objects (bucket_id, name)
    values ('image-originals', 'f0000000-0000-4000-8000-000000000001/stolen.jpg');
    raise exception 'FAIL 4e: a member wrote into somebody else''s folder';
  exception
    when insufficient_privilege then
      raise notice 'ok 4e: a member cannot write into somebody else''s folder';
  end;
end;
$$;

-- ===================================================================
-- 5. The record. An original may only be kept for something that was
--    published *and* marked — otherwise the row would claim to be
--    protecting a file that is identical to the public one.
-- ===================================================================
reset role;

do $$
declare item uuid;
begin
  insert into public.moderation_items (content_type, user_id, status)
  values ('project_image', 'f0000000-0000-4000-8000-000000000001', 'safe')
  returning id into item;

  begin
    update public.moderation_items
    set original_path = 'f0000000-0000-4000-8000-000000000001/x.jpg'
    where id = item;
    raise exception 'FAIL 5a: an original path was recorded with no public path';
  exception
    when check_violation then
      raise notice 'ok 5a: an original path needs a published copy';
  end;

  begin
    update public.moderation_items
    set public_path = 'f0000000-0000-4000-8000-000000000001/x.jpg',
        watermarked = false,
        original_path = 'f0000000-0000-4000-8000-000000000001/x.jpg'
    where id = item;
    raise exception 'FAIL 5b: an original was kept for an unmarked image';
  exception
    when check_violation then
      raise notice 'ok 5b: an original is only kept when the copy was marked';
  end;

  begin
    update public.moderation_items
    set watermarked = true,
        original_path = 'f0000000-0000-4000-8000-000000000001/x.jpg'
    where id = item;
    raise exception 'FAIL 5c: an original was kept for something never published';
  exception
    when check_violation then
      raise notice 'ok 5c: an original needs the public copy it is the original of';
  end;

  update public.moderation_items
  set public_path = 'f0000000-0000-4000-8000-000000000001/x.jpg',
      watermarked = true,
      original_path = 'f0000000-0000-4000-8000-000000000001/x.jpg'
  where id = item;
  raise notice 'ok 5d: a marked, published image may keep its original';

  -- Moving a published row back to `review` is now allowed and is exactly
  -- what a report does: 0076 publishes on `review` and looks afterwards. What
  -- stays unrepresentable is publishing something a check refused, or that no
  -- check has seen.
  update public.moderation_items set status = 'review' where id = item;
  raise notice 'ok 5e: a published row can go back for another look';

  begin
    update public.moderation_items set status = 'blocked' where id = item;
    raise exception 'FAIL 5f: a published row was marked blocked';
  exception
    when check_violation then
      raise notice 'ok 5f: but it cannot be published and refused at once';
  end;

  begin
    update public.moderation_items set status = 'pending' where id = item;
    raise exception 'FAIL 5g: a published row went back to unchecked';
  exception
    when check_violation then
      raise notice 'ok 5g: nor published and unchecked';
  end;

  update public.moderation_items set status = 'safe' where id = item;
end;
$$;

-- ===================================================================
-- 6. Existing rows are untouched. The column has to default to false,
--    or every image published before this migration would claim to
--    carry a mark it does not have.
-- ===================================================================
do $$
declare marked boolean;
declare total integer;
begin
  -- A row written without mentioning the column at all — which is every row
  -- that existed before this migration ran.
  insert into public.moderation_items (content_type, user_id, status, public_path)
  values ('product_image', 'f0000000-0000-4000-8000-000000000001', 'safe', 'legacy/y.jpg')
  returning watermarked into marked;

  if marked then
    raise exception 'FAIL 6a: an image published without a mark is recorded as marked';
  end if;
  raise notice 'ok 6a: the column defaults to false, so history is not misdescribed';

  select count(*) into total from public.moderation_items where watermarked;
  if total <> 1 then
    raise exception 'FAIL 6b: % rows claim a watermark, expected only the one set above', total;
  end if;
  raise notice 'ok 6b: nothing else claims to be watermarked';
end;
$$;

rollback;
