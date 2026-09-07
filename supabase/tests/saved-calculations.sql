-- Saved calculations are private; material prices are public to read and
-- administrator-only to write.
--
-- Run this after applying 0067. It prints one line per check and rolls itself
-- back.
--
-- It matters that the checks run as `authenticated`, not as the SQL editor's
-- default role. A superuser bypasses row-level security entirely, so a probe
-- run as one reports that every policy works and proves nothing.

begin;

insert into auth.users (id, email) values
  ('d0000000-0000-4000-8000-000000000001', 'saver@example.test'),
  ('d0000000-0000-4000-8000-000000000002', 'other@example.test'),
  ('d0000000-0000-4000-8000-000000000003', 'priceadmin@example.test')
on conflict (id) do nothing;

insert into public.profiles (id, username, full_name) values
  ('d0000000-0000-4000-8000-000000000001', 'probe_saver', 'Probe Saver'),
  ('d0000000-0000-4000-8000-000000000002', 'probe_other', 'Probe Other'),
  ('d0000000-0000-4000-8000-000000000003', 'probe_priceadmin', 'Probe Price Admin')
on conflict (id) do nothing;

grant select, insert, update, delete on public.saved_calculations to authenticated;

-- ===================================================================
-- 1. A person can save their own work and read it back.
-- ===================================================================
set role authenticated;
set local request.jwt.claim.sub = 'd0000000-0000-4000-8000-000000000001';

insert into public.saved_calculations (user_id, slug, name, inputs, headline)
values (
  'd0000000-0000-4000-8000-000000000001',
  'concrete-slab',
  'Ground floor slab',
  '{"length":{"raw":"8","unit":"m"},"width":{"raw":"6","unit":"m"}}'::jsonb,
  '7.560 m³'
);

select '1. the saver reads their own row' as step,
       count(*) = 1 as should_be_true
from public.saved_calculations
where slug = 'concrete-slab';

-- ===================================================================
-- 2. Somebody else cannot see it, and cannot delete it.
-- ===================================================================
reset role;
set role authenticated;
set local request.jwt.claim.sub = 'd0000000-0000-4000-8000-000000000002';

select '2. another member sees nothing' as step,
       count(*) = 0 as should_be_true
from public.saved_calculations;

with attempted as (
  delete from public.saved_calculations
  where slug = 'concrete-slab'
  returning 1
)
select '2b. and deletes nothing' as step,
       count(*) = 0 as should_be_true
from attempted;

-- ===================================================================
-- 3. A row cannot be inserted under somebody else's name.
-- ===================================================================
do $$
begin
  insert into public.saved_calculations (user_id, slug, name)
  values ('d0000000-0000-4000-8000-000000000001', 'boq', 'Not mine');
  raise notice '3. FAIL — inserted a row owned by another person';
exception when insufficient_privilege then
  raise notice '3. PASS — cannot save work under another account';
end $$;

-- ===================================================================
-- 4. The calculator price lookup reads the existing price book.
--
-- No new price table was created: material_prices is the one 0041 built and
-- 0042 seeded. These check the lookup ranks it the way a calculator needs.
-- ===================================================================
reset role;

insert into public.material_prices
  (category, material, unit, city_region, price_etb, data_status, price_date, supplier)
values
  -- The verified row is deliberately the OLDER of the two Addis rows. If the
  -- lookup ranked on date alone it would return the submitted 1150, so this
  -- fixture is what makes check 4 able to fail. With both rows on the same
  -- date the tie broke the right way by luck and the check proved nothing.
  ('Cement', 'Ordinary Portland Cement', 'bag', 'Addis Ababa', 1200, 'admin_verified', current_date - 5, 'Probe Supplier'),
  ('Cement', 'Ordinary Portland Cement', 'bag', 'Addis Ababa', 1150, 'supplier_submitted', current_date, 'Probe Other'),
  -- The newest Addis row of all, and the least trustworthy: this is what the
  -- 0042 seed looks like, and it must not win on date alone.
  ('Cement', 'Ordinary Portland Cement', 'bag', 'Addis Ababa', 9999, 'educational_estimate', current_date, 'Seed'),
  ('Cement', 'Ordinary Portland Cement', 'bag', 'Mekelle', 1320, 'supplier_submitted', current_date - 40, 'Probe North');

set role authenticated;
set local request.jwt.claim.sub = 'd0000000-0000-4000-8000-000000000002';

select '4. an admin-verified price beats a submitted one' as step,
       price = 1200 as should_be_true
from public.calculator_material_price('Ordinary Portland Cement', 'Addis Ababa');

select '4b. the reader''s own city wins over another' as step,
       city_region = 'Mekelle' as should_be_true
from public.calculator_material_price('Ordinary Portland Cement', 'Mekelle');

select '4c. the age comes back so staleness can be shown' as step,
       age_days = 40 as should_be_true
from public.calculator_material_price('Ordinary Portland Cement', 'Mekelle');

select '4d. an unknown material returns no row, not a guess' as step,
       count(*) = 0 as should_be_true
from public.calculator_material_price('Unobtainium', 'Addis Ababa');

-- The seeded educational estimates say in their own notes that they are not
-- market prices. Handing one to a calculator as a rate is the invented number
-- this feature exists to avoid.
select '4e. a newer educational estimate does not outrank a real price' as step,
       price = 1200 as should_be_true
from public.calculator_material_price('Ordinary Portland Cement', 'Addis Ababa');

select '4f. and the trust level comes back so it can be shown' as step,
       data_status = 'admin_verified' as should_be_true
from public.calculator_material_price('Ordinary Portland Cement', 'Addis Ababa');

-- ===================================================================
-- 4h. Trust ordering between two UNVERIFIED rows.
--
-- 4e cannot tell `data_status desc` from `verified desc`: an admin-verified
-- row wins under both, so that check passes whichever ordering is used and
-- proves nothing about the ranking. The difference only shows between two
-- rows that are both unverified — which is the ordinary case, because almost
-- nothing in the price book is admin-verified.
--
-- Here the newest row is the educational estimate. Ranking on the boolean
-- ties the two and lets the date decide, handing the calculator a seeded
-- guess; ranking on the enum puts the supplier's real price first.
-- ===================================================================
reset role;
insert into public.material_prices
  (category, material, unit, city_region, price_etb, data_status, price_date, supplier)
values
  ('Aggregates', 'Washed sand', 'm3', 'Addis Ababa', 3400, 'supplier_submitted', current_date - 3, 'Real Supplier'),
  ('Aggregates', 'Washed sand', 'm3', 'Addis Ababa', 8888, 'educational_estimate', current_date, 'Seed');

set role authenticated;
set local request.jwt.claim.sub = 'd0000000-0000-4000-8000-000000000002';

select '4h. a supplier price outranks a newer seeded estimate' as step,
       price = 3400 as should_be_true
from public.calculator_material_price('Washed sand', 'Addis Ababa');

select '4i. and it is the submitted status that comes back' as step,
       data_status = 'supplier_submitted' as should_be_true
from public.calculator_material_price('Washed sand', 'Addis Ababa');

-- ===================================================================
-- 4g. An expired price is not offered at all.
-- ===================================================================
reset role;
insert into public.material_prices
  (category, material, unit, city_region, price_etb, data_status, price_date, supplier)
values ('Cement', 'Expired Cement', 'bag', 'Addis Ababa', 500, 'expired', current_date, 'Old');

set role authenticated;
set local request.jwt.claim.sub = 'd0000000-0000-4000-8000-000000000002';

select '4g. an expired price is never offered' as step,
       count(*) = 0 as should_be_true
from public.calculator_material_price('Expired Cement', 'Addis Ababa');

-- ===================================================================
-- 5. A superseded price stops being the answer without being deleted.
-- ===================================================================
reset role;
update public.material_prices
set superseded_by = (
  select id from public.material_prices
  where city_region = 'Addis Ababa' and data_status = 'admin_verified'
)
where city_region = 'Addis Ababa' and data_status = 'admin_verified';

set role authenticated;
set local request.jwt.claim.sub = 'd0000000-0000-4000-8000-000000000002';

select '5. a superseded row is skipped' as step,
       price = 1150 as should_be_true
from public.calculator_material_price('Ordinary Portland Cement', 'Addis Ababa');

select '5b. but the history is still there' as step,
       count(*) = 4 as should_be_true
from public.material_prices where material = 'Ordinary Portland Cement';

-- ===================================================================
-- 6. A signed-out visitor can still be offered a price.
-- ===================================================================
reset role;
set role anon;
select '6. a guest gets a price too' as step,
       count(*) = 1 as should_be_true
from public.calculator_material_price('Ordinary Portland Cement', 'Addis Ababa');

rollback;
