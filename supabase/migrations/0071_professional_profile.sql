-- ---------------------------------------------------------------------------
-- The professional profile
-- ---------------------------------------------------------------------------
--
-- Two things, both about a profile page that has to be worth trusting.
--
-- The first is a bug. `/u/<username>` rendered `profiles.phone` to everybody
-- who opened it — signed in or not, indexed by search engines, no setting
-- anywhere to stop it. Somebody who typed a number in to receive a
-- confirmation code had it published as a consequence. Contact details are now
-- shown because their owner chose to show them.
--
-- The second is the rating. A tradesperson's standing on Medosha is spread
-- across the reviews of each service they offer plus any left against them
-- directly, and adding those up in the application means several round trips
-- and an answer that differs depending on which page asked.

-- ---------------------------------------------------------------------------
-- Contact visibility
-- ---------------------------------------------------------------------------

-- Default false, including for every profile that already exists. Turning
-- somebody's number on retroactively because they had entered one is exactly
-- the behaviour this replaces.
alter table public.profiles
  add column if not exists show_phone boolean not null default false,
  add column if not exists show_email boolean not null default false;

comment on column public.profiles.show_phone is
  'The owner has chosen to publish their phone number on their profile. Never implied by having one.';
comment on column public.profiles.show_email is
  'The owner has chosen to publish their email address on their profile.';

-- ---------------------------------------------------------------------------
-- Standing
-- ---------------------------------------------------------------------------

-- Every review that bears on one person: those left against them directly, and
-- those left on the services they provide. A service is somebody's work even
-- when the review is filed against the listing.
--
-- `security definer` for the same reason `review_summary` is: the aggregate is
-- over rows a reader can already see one at a time, and doing it here means
-- one answer rather than one per caller.
create or replace function public.professional_reputation(p_user uuid)
returns table (
  average numeric,
  total bigint,
  five bigint,
  four bigint,
  three bigint,
  two bigint,
  one bigint,
  verified_total bigint,
  service_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select r.rating, r.verified
    from public.reviews r
    where (r.subject_type = 'professional' and r.subject_id = p_user)
       or (
         r.subject_type = 'service'
         and r.subject_id in (
           select s.id from public.services s
           where s.provider_id = p_user and s.status = 'published'
         )
       )
  )
  select
    round(coalesce(avg(m.rating), 0), 2),
    count(*)::bigint,
    count(*) filter (where m.rating = 5)::bigint,
    count(*) filter (where m.rating = 4)::bigint,
    count(*) filter (where m.rating = 3)::bigint,
    count(*) filter (where m.rating = 2)::bigint,
    count(*) filter (where m.rating = 1)::bigint,
    -- Reviews backed by a booking or a hire, counted apart. A rating built
    -- only from unverified reviews is one anybody can manufacture.
    count(*) filter (where m.verified)::bigint,
    (
      select count(*)::bigint from public.services s
      where s.provider_id = p_user and s.status = 'published'
    )
  from mine m;
$$;

revoke all on function public.professional_reputation(uuid) from public;
-- Readable without an account: a profile is the page somebody lands on from a
-- shared link, and the rating is the reason they stay.
grant execute on function public.professional_reputation(uuid) to anon, authenticated;
