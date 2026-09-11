-- ---------------------------------------------------------------------------
-- Review after posting
-- ---------------------------------------------------------------------------
--
-- Three things, and the first is a bug.
--
-- ## Reporting a published image raised an error
--
-- 0052 constrained `public_path is null or status = 'safe'`, written when
-- `safe` was the only state a published file could be in. In the same
-- migration, `bump_report_count()` moves a reported item from `safe` back to
-- `review` — which trips that constraint on every item that has a public path.
-- So the Report button, on the marketplace and property pages, threw a check
-- violation for exactly the published content it exists to police. Nothing was
-- recorded and no moderator was told.
--
-- ## Uncertainty no longer blocks the seller
--
-- The upload path published only on `safe`. A `review` verdict — the
-- classifier was unsure, or there is no classifier configured — left the
-- seller looking at "One image is under review" with no listing. Most of what
-- lands in `review` is fine, and holding all of it back to catch the little
-- that is not means nobody can sell anything on a day the provider is down.
--
-- `review` now publishes and stays in the moderator's queue. `blocked` still
-- refuses, and `sexual_minors` still cannot be marked safe by anything — that
-- is not the case anybody was complaining about, and publishing it first would
-- be indefensible.
--
-- ## A report hides the file while a person looks
--
-- One report is an opinion and must not unpublish somebody's work, which 0052
-- already says. Several, or one in a category where being wrong is expensive,
-- hides the file until a moderator has looked — and tells the moderators it is
-- there.

-- ---------------------------------------------------------------------------
-- What may be published
-- ---------------------------------------------------------------------------

alter table public.moderation_items
  drop constraint if exists public_path_requires_safe;

alter table public.moderation_items
  add constraint public_path_requires_review_or_safe check (
    public_path is null or status in ('safe', 'review')
  );

comment on constraint public_path_requires_review_or_safe on public.moderation_items is
  'Published content is cleared or under review, never blocked and never still pending.';

-- ---------------------------------------------------------------------------
-- Hiding
-- ---------------------------------------------------------------------------

alter table public.moderation_items
  add column if not exists hidden_at timestamptz,
  add column if not exists hidden_reason text;

comment on column public.moderation_items.hidden_at is
  'Set when reports took the file out of view pending a moderator. Cleared when one decides.';

create index if not exists moderation_items_hidden_idx
  on public.moderation_items (hidden_at)
  where hidden_at is not null;

-- How many reports it takes. One is an opinion; three is a pattern.
create or replace function public.moderation_hide_threshold()
returns integer language sql immutable as $$ select 3 $$;

-- The categories where waiting for a third report is the wrong trade. Being
-- wrong about these for an afternoon costs more than hiding something that
-- turns out to be fine.
create or replace function public.moderation_hides_on_first(
  category public.moderation_category
)
returns boolean language sql immutable as $$
  select category in ('sexual_minors', 'sexual_explicit', 'illegal', 'threats');
$$;

-- ---------------------------------------------------------------------------
-- What a report does now
-- ---------------------------------------------------------------------------

create or replace function public.bump_report_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  item public.moderation_items;
  should_hide boolean;
begin
  update public.moderation_items
  set report_count = report_count + 1,
      -- A reported item that was already cleared goes back for another look.
      -- It does not go straight to blocked: a report is an opinion, and one
      -- person's opinion must not be able to unpublish somebody's work.
      status = case when status = 'safe' then 'review'::public.moderation_status else status end,
      last_action = 'user_reported'
  where id = new.item_id
  returning * into item;

  if item.id is null then
    return new;
  end if;

  should_hide :=
    item.hidden_at is null
    and item.public_path is not null
    and (
      public.moderation_hides_on_first(new.category)
      or item.report_count >= public.moderation_hide_threshold()
    );

  if should_hide then
    update public.moderation_items
    set hidden_at = now(),
        hidden_reason = case
          when public.moderation_hides_on_first(new.category)
            then 'reported: ' || new.category::text
          else 'reported by ' || item.report_count::text || ' people'
        end
    where id = item.id;

    -- Told, not left in a queue nobody is watching. The file is already out of
    -- view by the time this is read; the notification is what gets it looked
    -- at rather than left hidden indefinitely.
    insert into public.notifications (user_id, kind, title, body, href)
    select p.id,
           'system',
           'Content hidden pending review',
           'A ' || item.content_type::text ||
             ' was hidden after being reported. It is waiting for a decision.',
           '/admin/moderation'
    from public.profiles p
    where p.is_moderator or p.is_admin;
  end if;

  insert into public.moderation_audit (item_id, actor_id, action, detail)
  values (new.item_id, new.reporter_id, 'user_reported',
          jsonb_build_object('category', new.category,
                             'hidden', coalesce(should_hide, false)));

  return new;
end;
$$;

drop trigger if exists moderation_reports_bump on public.moderation_reports;
create trigger moderation_reports_bump
  after insert on public.moderation_reports
  for each row execute function public.bump_report_count();

-- ---------------------------------------------------------------------------
-- Rental, and files
-- ---------------------------------------------------------------------------

-- A third value rather than a second table. `equipment` is plant hire with
-- bookings, availability and deposits; this is somebody renting out a ladder
-- or a projector, which is a product listing with a rate instead of a price.
-- The sections stay disjoint because they read one column:
--
--   New Items   fulfilment = 'physical' and condition = 'new'
--   Used Items  fulfilment = 'physical' and condition <> 'new'
--   Rental      fulfilment = 'rental'
--   Digital     fulfilment = 'digital'
alter type public.product_fulfilment add value if not exists 'rental';

-- `rental_period` is not created here. 0011 already declared it as
-- ('daily', 'weekly', 'monthly') for equipment bookings, and a second type
-- with the same name and different values is how two parts of a marketplace
-- come to disagree about what a week is. This was written as day/week/month
-- and the `if not exists` guard silently kept the real one, which the test
-- then rejected — the right answer, arrived at the wrong way round.

alter table public.products
  add column if not exists rental_period public.rental_period,
  add column if not exists rental_deposit numeric(12, 2),
  -- Where the deliverable actually is. A path in a private bucket, never a
  -- public URL: the file is the thing being sold, and a marketplace that
  -- serves it to anybody who finds the address is not selling it.
  add column if not exists digital_file_path text,
  add column if not exists digital_file_name text;

comment on column public.products.digital_file_path is
  'Path in the private digital-goods bucket. Never served publicly — the file is the product.';

alter table public.products
  drop constraint if exists products_rental_fields_need_rental;
alter table public.products
  add constraint products_rental_fields_need_rental check (
    fulfilment = 'rental'
    or (rental_period is null and rental_deposit is null)
  );

alter table public.products
  drop constraint if exists products_rental_needs_period;
alter table public.products
  add constraint products_rental_needs_period check (
    fulfilment <> 'rental' or rental_period is not null
  );

alter table public.products
  drop constraint if exists products_file_path_needs_digital;
alter table public.products
  add constraint products_file_path_needs_digital check (
    fulfilment = 'digital'
    or (digital_file_path is null and digital_file_name is null)
  );

alter table public.products
  drop constraint if exists products_rental_deposit_sane;
alter table public.products
  add constraint products_rental_deposit_sane check (
    rental_deposit is null or rental_deposit >= 0
  );

create index if not exists products_rental_idx
  on public.products (fulfilment, rental_period)
  where status = 'published' and fulfilment = 'rental';

-- ---------------------------------------------------------------------------
-- The digital goods bucket
-- ---------------------------------------------------------------------------

-- Private. The file is what somebody is paying for, so a public bucket would
-- give it away to anybody who read the listing's HTML.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('digital-goods', 'digital-goods', false, 524288000, null)
on conflict (id) do nothing;

-- Folder-scoped to the seller, the same shape as quarantine and originals.
drop policy if exists "sellers read their own digital goods" on storage.objects;
create policy "sellers read their own digital goods"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'digital-goods'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "sellers write their own digital goods" on storage.objects;
create policy "sellers write their own digital goods"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'digital-goods'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "sellers delete their own digital goods" on storage.objects;
create policy "sellers delete their own digital goods"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'digital-goods'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "moderators read digital goods" on storage.objects;
create policy "moderators read digital goods"
  on storage.objects for select to authenticated
  using (bucket_id = 'digital-goods' and public.is_moderator());
