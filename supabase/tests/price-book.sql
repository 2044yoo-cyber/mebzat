-- The material price book, attacked rather than demonstrated.
--
-- The rules that matter here are all rules about *trust*: that a member cannot
-- promote their own price to verified, that an educational baseline never
-- outranks a supplier's figure, that history survives, and that nothing is ever
-- deleted. Each one is exercised as an attempt to break it.
--
-- Runs as `authenticated`. Running as a superuser bypasses RLS and reports that
-- every policy works.

begin;

insert into auth.users (id, email) values
  ('d0000000-0000-4000-8000-000000000001', 'supplier@example.test'),
  ('d0000000-0000-4000-8000-000000000002', 'admin@example.test'),
  ('d0000000-0000-4000-8000-000000000003', 'stranger@example.test');

update public.profiles set is_admin = true
 where id = 'd0000000-0000-4000-8000-000000000002';

create temporary table probe (name text, passed boolean, detail text) on commit drop;
grant all on probe to authenticated;

-- ---------------------------------------------------------------------------
-- The trust order
--
-- The resolver relies on the enum being declared weakest-first, so that
-- `order by data_status desc` is the order of trust. If somebody reorders the
-- enum in a later migration, every priority rule silently inverts — so the
-- order is asserted here rather than assumed.
-- ---------------------------------------------------------------------------

insert into probe
select 'an admin-verified price outranks a supplier submission',
       'admin_verified'::public.price_data_status > 'supplier_submitted'::public.price_data_status;

insert into probe
select 'a supplier submission outranks a web-sourced figure',
       'supplier_submitted'::public.price_data_status > 'web_sourced'::public.price_data_status;

insert into probe
select 'a web-sourced figure outranks an educational estimate',
       'web_sourced'::public.price_data_status > 'educational_estimate'::public.price_data_status;

insert into probe
select 'an educational estimate outranks an expired price',
       'educational_estimate'::public.price_data_status > 'expired'::public.price_data_status;

-- ---------------------------------------------------------------------------
-- Seeding, as the platform does it
-- ---------------------------------------------------------------------------

insert into public.material_prices
  (category, subcategory, material, specification, unit, city_region,
   price_etb, price_date, data_status, notes)
values
  ('Wood & Timber', 'Boards', 'Zztboard', '18 mm', 'sheet', 'Addis Ababa',
   6500, date '2026-07-01', 'educational_estimate', 'baseline'),
  ('Wood & Timber', 'Boards', 'Zztboard', '18 mm', 'sheet', 'Addis Ababa',
   7200, date '2026-08-01', 'web_sourced', 'Jiji listing'),
  ('Wood & Timber', 'Boards', 'Zztboard', '18 mm', 'sheet', 'Bahir Dar',
   7900, date '2026-08-05', 'web_sourced', 'regional'),
  ('Cement & Concrete', 'Cement', 'Wwtcement', '50 kg bag', 'bag', 'Addis Ababa',
   1100, date '2026-08-09', 'educational_estimate', 'baseline');

insert into probe
select 'the verified flag follows the status without being set by hand',
       count(*) = 0, count(*)::text
from public.material_prices where verified;

-- ---------------------------------------------------------------------------
-- A price cannot claim to be verified without a verifier
--
-- The highest level of trust is the one that must carry the most evidence.
-- ---------------------------------------------------------------------------

do $$
begin
  insert into public.material_prices
    (category, material, unit, price_etb, data_status)
  values ('Wood & Timber', 'Zztforged', 'sheet', 1, 'admin_verified');
  insert into probe values ('a verified price must name its verifier', false, 'the insert was allowed');
exception when check_violation then
  insert into probe values ('a verified price must name its verifier', true, null);
end $$;

-- A price dated in the future is a typo or a guess.
do $$
begin
  insert into public.material_prices
    (category, material, unit, price_etb, price_date, data_status)
  values ('Wood & Timber', 'Zzttime', 'sheet', 1,
          current_date + 400, 'educational_estimate');
  insert into probe values ('a price cannot be dated in the future', false, 'the insert was allowed');
exception when check_violation then
  insert into probe values ('a price cannot be dated in the future', true, null);
end $$;

-- ---------------------------------------------------------------------------
-- What a member may write
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = 'd0000000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';

insert into public.material_prices
  (category, material, specification, unit, city_region, price_etb, price_date,
   data_status, supplier, created_by)
values
  ('Wood & Timber', 'Zztboard', '18 mm', 'sheet', 'Addis Ababa', 7400,
   date '2026-08-10', 'supplier_submitted', 'Adama Boards',
   'd0000000-0000-4000-8000-000000000001');

insert into probe
select 'a member can submit a price for review', count(*) = 1, count(*)::text
from public.material_prices
where created_by = 'd0000000-0000-4000-8000-000000000001';

-- The attack this whole table exists to prevent: a supplier marking their own
-- price official.
do $$
begin
  insert into public.material_prices
    (category, material, unit, price_etb, data_status, created_by,
     verified_by, verified_at)
  values ('Wood & Timber', 'Zztselfapproved', 'sheet', 99999, 'admin_verified',
          'd0000000-0000-4000-8000-000000000001',
          'd0000000-0000-4000-8000-000000000001', now());
  insert into probe values ('a member cannot submit their own price as verified', false, 'the insert was allowed');
exception when insufficient_privilege then
  insert into probe values ('a member cannot submit their own price as verified', true, null);
end $$;

-- The quieter version of the same attack. `educational_estimate` needs no
-- verifier, so neither the check constraint nor the `verified_by is null`
-- clause stops it — only the status pin does. It matters because a seeded row
-- is presented to users as Medosha's own baseline: a member who can write one
-- can put their own number in the platform's mouth.
do $$
begin
  insert into public.material_prices
    (category, material, unit, price_etb, data_status, created_by)
  values ('Wood & Timber', 'Zztlaundered', 'sheet', 12345, 'educational_estimate',
          'd0000000-0000-4000-8000-000000000001');
  insert into probe values ('a member cannot write a platform baseline', false, 'the insert was allowed');
exception when insufficient_privilege then
  insert into probe values ('a member cannot write a platform baseline', true, null);
end $$;

-- Nor promote one afterwards, which is the same attack in two steps.
--
-- This one *raises* rather than quietly matching nothing, and the difference is
-- worth pinning down. The submitter's policy has a `using` clause that matches
-- the row — it is theirs, and it is still pending — so Postgres gets as far as
-- the `with check`, which refuses the new status. A policy whose `using` had
-- not matched would have updated zero rows in silence instead. The loud version
-- is the one to keep: a supplier who tries this gets told no.
do $$
begin
  update public.material_prices
  set data_status = 'admin_verified',
      verified_by = 'd0000000-0000-4000-8000-000000000001',
      verified_at = now()
  where created_by = 'd0000000-0000-4000-8000-000000000001';
  insert into probe values ('nor promote it afterwards', false, 'the update was allowed');
exception when insufficient_privilege then
  insert into probe values ('nor promote it afterwards', true, null);
end $$;

insert into probe
select 'and it is still pending after the attempt', count(*) = 1, count(*)::text
from public.material_prices
where created_by = 'd0000000-0000-4000-8000-000000000001'
  and data_status = 'supplier_submitted';

-- Somebody else's pending price is not theirs to touch.
set local request.jwt.claim.sub = 'd0000000-0000-4000-8000-000000000003';

update public.material_prices set price_etb = 1
where created_by = 'd0000000-0000-4000-8000-000000000001';

insert into probe
select 'a stranger cannot edit a pending price', count(*) = 0, count(*)::text
from public.material_prices
where created_by = 'd0000000-0000-4000-8000-000000000001' and price_etb = 1;

-- Reading, however, is open — a price book nobody can read is not a price book.
insert into probe
select 'anyone can read the book', count(*) >= 5, count(*)::text
from public.material_prices;

-- ---------------------------------------------------------------------------
-- What an administrator may do
-- ---------------------------------------------------------------------------

set local request.jwt.claim.sub = 'd0000000-0000-4000-8000-000000000002';

insert into probe
select 'the admin flag is visible to the policy', public.is_platform_admin();

update public.material_prices
set data_status = 'admin_verified',
    verified_by = 'd0000000-0000-4000-8000-000000000002',
    verified_at = now()
where created_by = 'd0000000-0000-4000-8000-000000000001';

insert into probe
select 'an administrator can approve a submission', count(*) = 1, count(*)::text
from public.material_prices
where created_by = 'd0000000-0000-4000-8000-000000000001'
  and data_status = 'admin_verified';

insert into probe
select 'and the generated flag follows', verified
from public.material_prices
where created_by = 'd0000000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- The audit trail
-- ---------------------------------------------------------------------------

insert into probe
select 'the approval was recorded', count(*) = 1, count(*)::text
from public.material_price_events e
join public.material_prices p on p.id = e.price_id
where p.created_by = 'd0000000-0000-4000-8000-000000000001'
  and e.action = 'approved';

insert into probe
select 'with the status it moved from and to',
       from_status = 'supplier_submitted' and to_status = 'admin_verified',
       format('%s -> %s', from_status, to_status)
from public.material_price_events e
join public.material_prices p on p.id = e.price_id
where p.created_by = 'd0000000-0000-4000-8000-000000000001'
  and e.action = 'approved';

-- Scoped to this test's own fixtures. The seed migration runs before the tests
-- and imports 455 rows of its own, so a global count here would be counting the
-- seed rather than checking the trigger.
insert into probe
select 'a seeded row is recorded as an import, not a submission',
       count(*) = 2, count(*)::text
from public.material_price_events e
join public.material_prices p on p.id = e.price_id
where e.action = 'imported' and p.material in ('Zztboard', 'Wwtcement');

-- ---------------------------------------------------------------------------
-- Lookup: the trust order, then recency
-- ---------------------------------------------------------------------------

set local role postgres;

insert into probe
select 'the verified price wins over every estimate',
       data_status = 'admin_verified' and price_etb = 7400,
       format('%s %s', data_status, price_etb)
from public.material_price_lookup('Zztboard', 'Addis Ababa', 'sheet', 10) limit 1;

-- With the verified row taken out, the web-sourced August figure must beat the
-- educational July one — not because it is newer, but because it is better
-- evidence. Both are true here, so the July web-sourced row below separates
-- them properly.
insert into public.material_prices
  (category, material, specification, unit, city_region, price_etb, price_date,
   data_status)
values
  ('Wood & Timber', 'Qqpply', '18 mm', 'sheet', 'Addis Ababa', 9999,
   date '2026-08-08', 'educational_estimate'),
  ('Wood & Timber', 'Qqpply', '18 mm', 'sheet', 'Addis Ababa', 4400,
   date '2026-06-01', 'web_sourced');

insert into probe
select 'a weaker status does not win by being newer',
       data_status = 'web_sourced' and price_etb = 4400,
       format('%s %s', data_status, price_etb)
from public.material_price_lookup('Qqpply', 'Addis Ababa', 'sheet', 10) limit 1;

-- City is a preference, not a filter: somebody asking about Bahir Dar still
-- gets an answer, and the row says where it came from.
insert into probe
select 'the requested city is preferred',
       city_region = 'Bahir Dar', city_region
from public.material_price_lookup('Zztboard', 'Bahir Dar', 'sheet', 10) limit 1;

insert into probe
select 'but another city is still offered rather than nothing',
       count(*) > 1, count(*)::text
from public.material_price_lookup('Zztboard', 'Bahir Dar', 'sheet', 10);

insert into probe
select 'a unit that does not match is excluded outright',
       count(*) = 0, count(*)::text
from public.material_price_lookup('Zztboard', 'Addis Ababa', 'm³', 10);

-- The retrieval is deliberately broad — "bronze balustrade" would legitimately
-- pull in anything mentioning either word, and the scorer is what rejects them.
-- To prove the *lookup* can return nothing, the phrase has to share no word
-- with the book at all.
insert into probe
select 'a phrase sharing no word with the book returns nothing',
       count(*) = 0, count(*)::text
from public.material_price_lookup('qwertyuiop zxcvbnm', null, null, 10);

-- ---------------------------------------------------------------------------
-- Words
--
-- The brief's own example is "How much is MDF 18mm in Addis?". If "18mm" does
-- not find a row whose specification reads "18 mm", the headline feature
-- returns nothing, and it returns nothing silently — which looks exactly like
-- an empty price book.
-- ---------------------------------------------------------------------------

insert into probe
select 'a digit pressed against a letter is split',
       public.price_search_terms('MDF 18mm') = array['mdf', '18', 'mm'],
       public.price_search_terms('MDF 18mm')::text;

-- Single characters are dropped: as a search term "c" is an ilike against
-- every row in the book, and it is the 25 that tells C25 from C30 anyway. The
-- scorer still sees the untouched text, so nothing is lost where it matters.
insert into probe
select 'and so is a letter pressed against a digit',
       public.price_search_terms('C25 concrete') = array['25', 'concrete'],
       public.price_search_terms('C25 concrete')::text;

insert into probe
select 'punctuation and case are not words',
       public.price_search_terms('  Hollow-Concrete BLOCK, 200mm  ')
         = array['hollow', 'concrete', 'block', '200', 'mm'],
       public.price_search_terms('  Hollow-Concrete BLOCK, 200mm  ')::text;

insert into probe
select 'an empty phrase yields no words rather than one empty one',
       public.price_search_terms('   ') = '{}'::text[],
       public.price_search_terms('   ')::text;

insert into probe
select 'the example query from the brief finds the board',
       count(*) > 0, count(*)::text
from public.material_price_lookup('MDF 18mm', 'Addis Ababa', 'sheet', 10);

-- Any word, not all of them. Somebody typing a full description — "premium
-- imported Zztboard" — must still reach a row that only says "Zztboard". If
-- retrieval demanded every word, the more precisely somebody described what
-- they wanted the less they would find, which is exactly backwards. Narrowing
-- is the scorer's job, and it can only narrow what retrieval handed it.
insert into probe
select 'an extra word the book has never seen does not eliminate a row',
       count(*) > 0, count(*)::text
from public.material_price_lookup('premium imported Zztboard', 'Addis Ababa', 'sheet', 10);

insert into probe
select 'a phrase with no words at all matches nothing, not everything',
       count(*) = 0, count(*)::text
from public.material_price_lookup('!!! ???', null, null, 10);

-- ---------------------------------------------------------------------------
-- Expiry
--
-- Nothing is ever deleted, and a teaching baseline cannot go stale because it
-- was never current. Expiring the seed would empty the book on day one.
-- ---------------------------------------------------------------------------

-- Counted before the sweep, so "nothing was deleted" compares two numbers
-- rather than a number against a literal somebody has to keep in step with the
-- fixtures above.
create temporary table before_expiry on commit drop as
select count(*) as rows from public.material_prices;

-- A table rather than psql's \gset: a metacommand that runs while the
-- transaction is healthy still fails to interpolate if an earlier statement
-- aborted it, and the resulting syntax error is far from the real cause.
create temporary table expiry_run on commit drop as
select public.expire_stale_material_prices(30) as expired;

insert into probe
select 'stale sourced prices are expired', expired > 0, expired::text
from expiry_run;

insert into probe
select 'educational baselines are exempt', count(*) = 0, count(*)::text
from public.material_prices
where data_status = 'expired' and notes = 'baseline';

insert into probe
select 'nothing was deleted',
       (select count(*) from public.material_prices) = before_expiry.rows,
       format('%s before, %s after',
              before_expiry.rows, (select count(*) from public.material_prices))
from before_expiry;

-- Plywood, not MDF: the June web-sourced plywood row is the only one old
-- enough to have been swept, so it is the only one that can prove the
-- exclusion. Asking about a material that has no expired row proves nothing,
-- which is what the first version of this check did.
insert into probe
select 'an expired price is no longer offered as an answer',
       count(*) = 0, count(*)::text
from public.material_price_lookup('Qqpply', 'Addis Ababa', 'sheet', 10)
where data_status = 'expired';

-- And the consequence, stated plainly: the book now answers with the weaker
-- baseline, because the better figure went stale. That is the correct outcome
-- and the reason the admin queue matters.
insert into probe
select 'so the answer falls back to what is left',
       data_status = 'educational_estimate' and price_etb = 9999,
       format('%s %s', data_status, price_etb)
from public.material_price_lookup('Qqpply', 'Addis Ababa', 'sheet', 10) limit 1;

insert into probe
select 'but its history survives for the chart',
       count(*) > 0, count(*)::text
from public.material_price_events e
join public.material_prices p on p.id = e.price_id
where p.data_status = 'expired';

-- ---------------------------------------------------------------------------

select
  case when passed then '   PASS' else '** FAIL' end as result,
  name, coalesce(detail, case when passed is null then '(no verdict)' end)
from probe
order by passed nulls first, name;

select format('%s passed, %s failed',
              count(*) filter (where passed),
              count(*) filter (where passed is not true)) as summary
from probe;

rollback;
