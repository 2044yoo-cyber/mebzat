-- Agenda's construction record: who can see what, and what the triggers derive.
--
-- Run after applying 0091. Prints one line per check and rolls itself back.
-- Every access question is asked as `authenticated` with a jwt subject: a
-- superuser bypasses row-level security, and the subject of this file is
-- almost entirely row-level security.
--
-- Four people, because three is not enough to catch the interesting bug:
--
--   owner        — started the project, sees everything
--   surveyor     — a member with can_view_finance and can_view_contracts
--   site         — a member with neither, which is the default
--   outsider     — not on the project at all

begin;

insert into auth.users (id, email) values
  ('a6000000-0000-4000-8000-000000000001', 'owner@example.test'),
  ('a6000000-0000-4000-8000-000000000002', 'surveyor@example.test'),
  ('a6000000-0000-4000-8000-000000000003', 'site@example.test'),
  ('a6000000-0000-4000-8000-000000000004', 'outsider@example.test')
on conflict (id) do nothing;

update public.profiles set username = 'probe_owner', full_name = 'Owner'
where id = 'a6000000-0000-4000-8000-000000000001';
update public.profiles set username = 'probe_qs', full_name = 'Quantity Surveyor'
where id = 'a6000000-0000-4000-8000-000000000002';
update public.profiles set username = 'probe_site', full_name = 'Site Engineer'
where id = 'a6000000-0000-4000-8000-000000000003';
update public.profiles set username = 'probe_outsider', full_name = 'Outsider'
where id = 'a6000000-0000-4000-8000-000000000004';

-- ===================================================================
-- 1. Starting a project makes you a member of it.
--
-- Without the seed trigger the creator cannot read the row they just wrote:
-- the select policy asks `agenda_is_member`, and there are no members yet.
-- ===================================================================
set role authenticated;
set local request.jwt.claim.sub = 'a6000000-0000-4000-8000-000000000001';

do $$
declare n integer;
begin
  insert into public.agenda_projects (id, owner_id, name, project_number, contract_value)
  values ('a6000000-0000-4000-8000-00000000000a',
          'a6000000-0000-4000-8000-000000000001',
          'Bole Mixed-Use Tower', 'MED-001', 42000000);

  select count(*) into n from public.agenda_projects
  where id = 'a6000000-0000-4000-8000-00000000000a';
  if n <> 1 then
    raise exception 'FAIL 1a: the creator cannot read the project they just made';
  end if;
  raise notice 'ok 1a: starting a project makes you a member of it';

  select count(*) into n from public.agenda_members
  where project_id = 'a6000000-0000-4000-8000-00000000000a'
    and user_id = 'a6000000-0000-4000-8000-000000000001'
    and role = 'administrator' and status = 'active';
  if n <> 1 then
    raise exception 'FAIL 1b: the owner is not an active administrator';
  end if;
  raise notice 'ok 1b: as an active administrator, which is what the helpers check for';
end;
$$;

reset role;
insert into public.agenda_members
  (project_id, user_id, role, status, can_view_finance, can_view_contracts, accepted_at)
values
  ('a6000000-0000-4000-8000-00000000000a', 'a6000000-0000-4000-8000-000000000002',
   'quantity_surveyor', 'active', true, true, now()),
  ('a6000000-0000-4000-8000-00000000000a', 'a6000000-0000-4000-8000-000000000003',
   'engineer', 'active', false, false, now());

insert into public.agenda_contracts
  (id, project_id, number, company_name, original_value)
values ('a6000000-0000-4000-8000-00000000000c',
        'a6000000-0000-4000-8000-00000000000a', 'C-001', 'ABC Contracting', 10000000);

insert into public.agenda_budget_items
  (project_id, cost_code, name, original_budget, actual_cost)
values ('a6000000-0000-4000-8000-00000000000a', '01-100', 'Substructure', 5000000, 1200000);

insert into public.agenda_drawings (id, project_id, drawing_number, title)
values ('a6000000-0000-4000-8000-00000000000d',
        'a6000000-0000-4000-8000-00000000000a', 'A-101', 'Ground Floor Plan');

set role authenticated;

-- A project is started for yourself, not for somebody else. Without this the
-- insert policy's `owner_id = auth.uid()` can be deleted and nothing notices.
do $$
begin
  begin
    insert into public.agenda_projects (owner_id, name)
    values ('a6000000-0000-4000-8000-000000000004', 'Project in somebody else''s name');
    raise exception 'FAIL 1c: a project was started in somebody else''s name';
  exception
    when insufficient_privilege then
      raise notice 'ok 1c: and only for yourself';
  end;
end;
$$;

-- ===================================================================
-- 2. An outsider sees nothing, whatever they know the id of.
-- ===================================================================
set local request.jwt.claim.sub = 'a6000000-0000-4000-8000-000000000004';
do $$
declare n integer;
begin
  select count(*) into n from public.agenda_projects;
  if n <> 0 then raise exception 'FAIL 2a: an outsider read % projects', n; end if;

  select count(*) into n from public.agenda_drawings;
  if n <> 0 then raise exception 'FAIL 2b: an outsider read the drawings'; end if;

  select count(*) into n from public.agenda_budget_items;
  if n <> 0 then raise exception 'FAIL 2c: an outsider read the budget'; end if;

  select count(*) into n from public.agenda_contracts;
  if n <> 0 then raise exception 'FAIL 2d: an outsider read the contracts'; end if;

  raise notice 'ok 2: knowing the project id opens nothing';
end;
$$;

do $$
begin
  begin
    insert into public.agenda_drawings (project_id, drawing_number, title)
    values ('a6000000-0000-4000-8000-00000000000a', 'X-999', 'Planted');
    raise exception 'FAIL 2e: an outsider wrote into somebody else''s project';
  exception
    when insufficient_privilege then
      raise notice 'ok 2e: and writes nothing either';
  end;
end;
$$;

-- ===================================================================
-- 3. A member without the finance permission sees the site, not the money.
--
-- This is the case the whole file exists for. A site engineer belongs on the
-- project and does not belong in the contract value.
-- ===================================================================
set local request.jwt.claim.sub = 'a6000000-0000-4000-8000-000000000003';
do $$
declare n integer;
begin
  select count(*) into n from public.agenda_projects;
  if n <> 1 then raise exception 'FAIL 3a: a member cannot see their project'; end if;
  raise notice 'ok 3a: a member sees the project';

  select count(*) into n from public.agenda_drawings;
  if n <> 1 then raise exception 'FAIL 3b: a member cannot see the drawings'; end if;
  raise notice 'ok 3b: and the drawings';

  select count(*) into n from public.agenda_budget_items;
  if n <> 0 then
    raise exception 'FAIL 3c: a member with no finance permission read the budget';
  end if;
  raise notice 'ok 3c: but not the budget';

  select count(*) into n from public.agenda_contracts;
  if n <> 0 then
    raise exception 'FAIL 3d: a member with no contracts permission read the contracts';
  end if;
  raise notice 'ok 3d: and not the contracts';
end;
$$;

do $$
begin
  begin
    insert into public.agenda_invoices (project_id, number, company_name, amount)
    values ('a6000000-0000-4000-8000-00000000000a', 'INV-X', 'Somebody', 1);
    raise exception 'FAIL 3e: a member with no finance permission raised an invoice';
  exception
    when insufficient_privilege then
      raise notice 'ok 3e: nor can they raise an invoice';
  end;
end;
$$;

-- ===================================================================
-- 4. The two permissions are separate.
-- ===================================================================
set local request.jwt.claim.sub = 'a6000000-0000-4000-8000-000000000002';
do $$
declare n integer;
begin
  select count(*) into n from public.agenda_budget_items;
  if n <> 1 then raise exception 'FAIL 4a: the surveyor cannot read the budget'; end if;
  select count(*) into n from public.agenda_contracts;
  if n <> 1 then raise exception 'FAIL 4b: the surveyor cannot read the contracts'; end if;
  raise notice 'ok 4: a member given finance and contracts reads both';
end;
$$;

-- Withdrawn by the owner, as the owner. 0024's `agenda_guard_member_update`
-- refuses a permission change from anybody but the client or an
-- administrator, and it reads `auth.uid()` — so doing this as superuser is
-- refused for having no identity at all, which is the trigger working.
set local request.jwt.claim.sub = 'a6000000-0000-4000-8000-000000000001';
update public.agenda_members set can_view_contracts = false
where project_id = 'a6000000-0000-4000-8000-00000000000a'
  and user_id = 'a6000000-0000-4000-8000-000000000002';

set local request.jwt.claim.sub = 'a6000000-0000-4000-8000-000000000002';

do $$
declare n integer;
begin
  select count(*) into n from public.agenda_budget_items;
  if n <> 1 then
    raise exception 'FAIL 4c: withdrawing contracts also withdrew the budget';
  end if;
  select count(*) into n from public.agenda_contracts;
  if n <> 0 then
    raise exception 'FAIL 4d: withdrawing the contracts permission changed nothing';
  end if;
  raise notice 'ok 4c-d: finance and contracts are separate permissions';
end;
$$;

-- ===================================================================
-- 4e. A permission is not a permission once the member is suspended.
--
-- `can_view_contracts` stays set on a suspended row — removing somebody should
-- not silently rewrite what they were once allowed — so the helper has to
-- check the status as well, and this is what says so.
-- ===================================================================
set local request.jwt.claim.sub = 'a6000000-0000-4000-8000-000000000001';
update public.agenda_members
set status = 'suspended', can_view_contracts = true, can_view_finance = true
where project_id = 'a6000000-0000-4000-8000-00000000000a'
  and user_id = 'a6000000-0000-4000-8000-000000000002';

set local request.jwt.claim.sub = 'a6000000-0000-4000-8000-000000000002';
do $$
declare n integer;
begin
  select count(*) into n from public.agenda_contracts;
  if n <> 0 then
    raise exception 'FAIL 4e: a suspended member still read the contracts';
  end if;
  select count(*) into n from public.agenda_budget_items;
  if n <> 0 then
    raise exception 'FAIL 4f: a suspended member still read the budget';
  end if;
  raise notice 'ok 4e-f: a suspended member keeps the flag and loses the access';
end;
$$;

-- ===================================================================
-- 5. A drawing is a series of files with one of them current.
-- ===================================================================
reset role;
insert into public.agenda_drawing_revisions
  (drawing_id, project_id, revision, storage_path)
values
  ('a6000000-0000-4000-8000-00000000000d', 'a6000000-0000-4000-8000-00000000000a',
   'Rev 01', 'p/a101-r1.pdf'),
  ('a6000000-0000-4000-8000-00000000000d', 'a6000000-0000-4000-8000-00000000000a',
   'Rev 02', 'p/a101-r2.pdf');

do $$
declare current_rev text; kept integer;
begin
  select r.revision into current_rev
  from public.agenda_drawings d
  join public.agenda_drawing_revisions r on r.id = d.current_revision_id
  where d.id = 'a6000000-0000-4000-8000-00000000000d';

  -- `is distinct from`, not `<>`. When the trigger stops setting
  -- `current_revision_id` the join finds nothing, `current_rev` is null, and
  -- `null <> 'Rev 02'` is null — which does not fire an `if`. The check passed
  -- on a drawing with no current revision at all.
  if current_rev is distinct from 'Rev 02' then
    raise exception 'FAIL 5a: the current revision is %, not the newest',
      coalesce(current_rev, 'null');
  end if;
  raise notice 'ok 5a: the newest revision issued becomes the current one';

  select count(*) into kept from public.agenda_drawing_revisions
  where drawing_id = 'a6000000-0000-4000-8000-00000000000d';
  if kept <> 2 then
    raise exception 'FAIL 5b: expected both revisions on file, found %', kept;
  end if;
  raise notice 'ok 5b: and the old one is kept, which is the point';
end;
$$;

-- ===================================================================
-- 6. An approved change order moves the contract sum.
-- ===================================================================
insert into public.agenda_change_orders
  (id, project_id, contract_id, number, title, cost_impact, status)
values ('a6000000-0000-4000-8000-00000000000e',
        'a6000000-0000-4000-8000-00000000000a',
        'a6000000-0000-4000-8000-00000000000c',
        'CO-001', 'Extra basement waterproofing', 500000, 'draft');

do $$
declare value numeric;
begin
  select current_value into value from public.agenda_contracts
  where id = 'a6000000-0000-4000-8000-00000000000c';
  if value <> 10000000 then
    raise exception 'FAIL 6a: a draft change order already moved the contract to %', value;
  end if;
  raise notice 'ok 6a: a draft change order does not move the contract sum';

  update public.agenda_change_orders set status = 'approved'
  where id = 'a6000000-0000-4000-8000-00000000000e';

  select current_value into value from public.agenda_contracts
  where id = 'a6000000-0000-4000-8000-00000000000c';
  if value <> 10500000 then
    raise exception 'FAIL 6b: approving it left the contract at %', value;
  end if;
  raise notice 'ok 6b: approving it does';

  update public.agenda_change_orders set status = 'rejected'
  where id = 'a6000000-0000-4000-8000-00000000000e';

  select current_value into value from public.agenda_contracts
  where id = 'a6000000-0000-4000-8000-00000000000c';
  if value <> 10000000 then
    raise exception 'FAIL 6c: reversing it left the contract at %', value;
  end if;
  raise notice 'ok 6c: and reversing it puts the contract back';
end;
$$;

-- ===================================================================
-- 7. An invoice follows what has been paid against it.
-- ===================================================================
insert into public.agenda_invoices
  (id, project_id, number, company_name, amount, tax_amount, retention_amount, status)
values ('a6000000-0000-4000-8000-00000000000f',
        'a6000000-0000-4000-8000-00000000000a',
        'INV-001', 'ABC Contracting', 1000000, 150000, 50000, 'approved');

do $$
declare total numeric; state text;
begin
  select total_amount into total from public.agenda_invoices
  where id = 'a6000000-0000-4000-8000-00000000000f';
  if total <> 1100000 then
    raise exception 'FAIL 7a: the invoice total is %, not amount + tax - retention', total;
  end if;
  raise notice 'ok 7a: retention is held back rather than folded into the total';

  insert into public.agenda_payments (project_id, invoice_id, payee_name, amount)
  values ('a6000000-0000-4000-8000-00000000000a',
          'a6000000-0000-4000-8000-00000000000f', 'ABC Contracting', 400000);

  select status::text into state from public.agenda_invoices
  where id = 'a6000000-0000-4000-8000-00000000000f';
  if state <> 'partially_paid' then
    raise exception 'FAIL 7b: after a part payment the invoice reads %', state;
  end if;
  raise notice 'ok 7b: a part payment reads as partially paid';

  insert into public.agenda_payments (project_id, invoice_id, payee_name, amount)
  values ('a6000000-0000-4000-8000-00000000000a',
          'a6000000-0000-4000-8000-00000000000f', 'ABC Contracting', 700000);

  select status::text into state from public.agenda_invoices
  where id = 'a6000000-0000-4000-8000-00000000000f';
  if state <> 'paid' then
    raise exception 'FAIL 7c: after settling in full the invoice reads %', state;
  end if;
  raise notice 'ok 7c: and settling it in full reads as paid';
end;
$$;

-- A rejected invoice is not quietly marked paid by a stray payment row.
insert into public.agenda_invoices
  (id, project_id, number, company_name, amount, status)
values ('a6000000-0000-4000-8000-0000000000aa',
        'a6000000-0000-4000-8000-00000000000a', 'INV-002', 'Disputed Ltd', 900000, 'rejected');

do $$
declare state text;
begin
  insert into public.agenda_payments (project_id, invoice_id, payee_name, amount)
  values ('a6000000-0000-4000-8000-00000000000a',
          'a6000000-0000-4000-8000-0000000000aa', 'Disputed Ltd', 900000);

  select status::text into state from public.agenda_invoices
  where id = 'a6000000-0000-4000-8000-0000000000aa';
  if state <> 'rejected' then
    raise exception 'FAIL 7d: a payment against a rejected invoice set it to %', state;
  end if;
  raise notice 'ok 7d: a payment does not settle an invoice nobody approved';
end;
$$;

-- ===================================================================
-- 8. A confidential document needs the permission its confidentiality names.
-- ===================================================================
insert into public.agenda_documents (id, project_id, title, confidentiality)
values
  ('a6000000-0000-4000-8000-0000000000b1', 'a6000000-0000-4000-8000-00000000000a',
   'Method statement', 'members'),
  ('a6000000-0000-4000-8000-0000000000b2', 'a6000000-0000-4000-8000-00000000000a',
   'Signed contract', 'finance');

set role authenticated;
set local request.jwt.claim.sub = 'a6000000-0000-4000-8000-000000000003';
do $$
declare n integer;
begin
  select count(*) into n from public.agenda_documents;
  if n <> 1 then
    raise exception 'FAIL 8a: the site engineer sees % documents, not just the open one', n;
  end if;
  raise notice 'ok 8a: a member reads the documents filed for members';

  select count(*) into n from public.agenda_documents
  where id = 'a6000000-0000-4000-8000-0000000000b2';
  if n <> 0 then
    raise exception 'FAIL 8b: and read one filed under finance';
  end if;
  raise notice 'ok 8b: and not one filed under finance';
end;
$$;

-- ===================================================================
-- 9. The BOQ does its own arithmetic.
-- ===================================================================
reset role;
do $$
declare line numeric;
begin
  insert into public.agenda_boq_items
    (project_id, section, description, unit, quantity, unit_price)
  values ('a6000000-0000-4000-8000-00000000000a', 'Concrete',
          'C-25 to foundations', 'm3', 128.5, 4200);

  select amount into line from public.agenda_boq_items
  where description = 'C-25 to foundations';
  if line <> 539700.00 then
    raise exception 'FAIL 9: the line total is %, not quantity x price', line;
  end if;
  raise notice 'ok 9: a BOQ line totals itself rather than trusting a written copy';
end;
$$;

-- ===================================================================
-- 10. Nothing in Agenda may be deleted.
-- ===================================================================
set role authenticated;
set local request.jwt.claim.sub = 'a6000000-0000-4000-8000-000000000001';
do $$
declare n integer;
begin
  delete from public.agenda_drawings
  where id = 'a6000000-0000-4000-8000-00000000000d';

  select count(*) into n from public.agenda_drawings
  where id = 'a6000000-0000-4000-8000-00000000000d';
  if n <> 1 then
    raise exception 'FAIL 10: the owner deleted a drawing';
  end if;
  raise notice 'ok 10: not even the owner can delete a site record';
exception
  when insufficient_privilege then
    raise notice 'ok 10: not even the owner can delete a site record';
end;
$$;

-- ===================================================================
-- 11. The contracts permission is readable at all.
--
-- `can_view_contracts` has existed since 0024 with no function to ask about
-- it, so it was a setting the client could change and no policy consulted.
-- ===================================================================
reset role;
do $$
begin
  if not has_function_privilege('authenticated',
       'public.agenda_can_view_contracts(uuid)', 'execute') then
    raise exception 'FAIL 11a: a member cannot call the contracts permission';
  end if;
  if has_function_privilege('anon',
       'public.agenda_can_view_contracts(uuid)', 'execute') then
    raise exception 'FAIL 11b: a signed-out visitor can call it';
  end if;
  raise notice 'ok 11: the contracts permission has a reader, and it is not open to anon';
end;
$$;

-- ===================================================================
-- 12. Record numbers: sequential, per project, per kind.
--
-- "The clash on RFI-023" is how a site meeting refers to a question, so the
-- number has to be short, sequential and stable. The interesting failures are
-- a counter shared between kinds (an RFI and a submittal taking turns) and a
-- counter that is not a counter at all — a constant, or a count that restarts.
-- ===================================================================
reset role;
set role authenticated;
set local request.jwt.claim.sub = 'a6000000-0000-4000-8000-000000000001';

do $$
declare
  first text;
  second text;
  third text;
  other text;
  visible integer;
begin
  -- `is distinct from` throughout rather than `<>`. A function that stops
  -- finding its counter row returns null, `null <> 'RFI-001'` is null, and a
  -- plpgsql `if` does not fire on null — so the broken version passed every
  -- one of these until mutation testing said otherwise.
  first := public.agenda_next_number(
    'a6000000-0000-4000-8000-00000000000a', 'rfi', 'RFI');
  second := public.agenda_next_number(
    'a6000000-0000-4000-8000-00000000000a', 'rfi', 'RFI');
  third := public.agenda_next_number(
    'a6000000-0000-4000-8000-00000000000a', 'rfi', 'RFI');

  if first is distinct from 'RFI-001' then
    raise exception 'FAIL 12a: the first number is %, not RFI-001', first;
  end if;
  if second is distinct from 'RFI-002'
     or third is distinct from 'RFI-003' then
    raise exception 'FAIL 12a: the sequence went % then % then %',
      first, second, third;
  end if;
  raise notice 'ok 12a: RFI-001, RFI-002, RFI-003';

  -- A shared counter would make this SUB-004.
  other := public.agenda_next_number(
    'a6000000-0000-4000-8000-00000000000a', 'submittal', 'SUB');
  if other is distinct from 'SUB-001' then
    raise exception 'FAIL 12b: submittals started at %, so the counter is shared with RFIs', other;
  end if;
  raise notice 'ok 12b: each kind counts on its own';

  -- The table has no policy. The function is the whole interface to it, and
  -- a member reading it directly must come back empty rather than being
  -- allowed to set the next number themselves.
  select count(*) into visible from public.agenda_counters;
  if visible <> 0 then
    raise exception 'FAIL 12c: a member can read % counter rows directly', visible;
  end if;
  raise notice 'ok 12c: the counter table is reachable only through the function';
end;
$$;

-- Somebody who is not on the project cannot take a number from it.
reset role;
set role authenticated;
set local request.jwt.claim.sub = 'a6000000-0000-4000-8000-000000000004';

do $$
declare taken text;
begin
  taken := public.agenda_next_number(
    'a6000000-0000-4000-8000-00000000000a', 'rfi', 'RFI');
  raise exception 'FAIL 12d: an outsider took % from a project they are not on', taken;
exception
  when insufficient_privilege then
    raise notice 'ok 12d: an outsider is refused a number';
end;
$$;

reset role;
do $$
begin
  if has_function_privilege('anon',
       'public.agenda_next_number(uuid, text, text, integer)', 'execute') then
    raise exception 'FAIL 12e: a signed-out visitor can take record numbers';
  end if;
  raise notice 'ok 12e: numbering is not open to anon';
end;
$$;

-- ===================================================================
-- 13. A submittal's current revision is the newest one issued.
--
-- 0090 gave submittals the column and the foreign key and no trigger, so it
-- was null on every row. Drawings had the same shape and did have one, which
-- is exactly how a gap like this hides: the pattern looks complete.
-- ===================================================================
reset role;
set role authenticated;
set local request.jwt.claim.sub = 'a6000000-0000-4000-8000-000000000001';

do $$
declare
  submittal uuid;
  rev_one uuid;
  rev_two uuid;
  current_id uuid;
begin
  insert into public.agenda_submittals (project_id, number, title, status)
  values ('a6000000-0000-4000-8000-00000000000a', 'SUB-900',
          'Reinforcement shop drawings', 'pending')
  returning id into submittal;

  insert into public.agenda_submittal_revisions
    (submittal_id, project_id, revision, status)
  values (submittal, 'a6000000-0000-4000-8000-00000000000a', 1, 'pending')
  returning id into rev_one;

  select current_revision_id into current_id
  from public.agenda_submittals where id = submittal;
  if current_id is distinct from rev_one then
    raise exception 'FAIL 13a: Rev 01 did not become current';
  end if;
  raise notice 'ok 13a: issuing Rev 01 makes it current';

  insert into public.agenda_submittal_revisions
    (submittal_id, project_id, revision, status)
  values (submittal, 'a6000000-0000-4000-8000-00000000000a', 2, 'pending')
  returning id into rev_two;

  select current_revision_id into current_id
  from public.agenda_submittals where id = submittal;
  if current_id is distinct from rev_two then
    raise exception 'FAIL 13b: Rev 02 did not replace Rev 01 as current';
  end if;
  raise notice 'ok 13b: Rev 02 replaces it';

  -- Nothing is deleted. Rev 01 is still there to answer "what did the
  -- contractor build to in March", which is the question a dispute turns on.
  if not exists (
    select 1 from public.agenda_submittal_revisions where id = rev_one
  ) then
    raise exception 'FAIL 13c: issuing Rev 02 destroyed Rev 01';
  end if;
  raise notice 'ok 13c: and does not destroy it';
end;
$$;

-- ===================================================================
-- 14. The site file store: one private bucket, keyed by project.
--
-- A site photograph shows a client's building, its progress and often its
-- security arrangements. "Unlisted URL" is not a permission, so the bucket is
-- private and the policy asks the same question every table asks.
-- ===================================================================
reset role;
do $$
declare is_public boolean;
begin
  select public into is_public from storage.buckets where id = 'agenda-files';
  if is_public is null then
    raise exception 'FAIL 14a: there is no agenda-files bucket';
  end if;
  if is_public then
    raise exception 'FAIL 14a: the agenda-files bucket is public';
  end if;
  raise notice 'ok 14a: agenda-files exists and is private';
end;
$$;

-- A member files something under the project.
set role authenticated;
set local request.jwt.claim.sub = 'a6000000-0000-4000-8000-000000000003';

do $$
declare visible integer;
begin
  insert into storage.objects (bucket_id, name, owner)
  values ('agenda-files',
          'a6000000-0000-4000-8000-00000000000a/photos/slab-pour.jpg',
          'a6000000-0000-4000-8000-000000000003');

  select count(*) into visible from storage.objects
  where bucket_id = 'agenda-files';
  if visible <> 1 then
    raise exception 'FAIL 14b: a member sees % of their own project files', visible;
  end if;
  raise notice 'ok 14b: a member files and reads what is under their project';
end;
$$;

-- Somebody not on the project can neither read it nor file into it.
reset role;
set role authenticated;
set local request.jwt.claim.sub = 'a6000000-0000-4000-8000-000000000004';

do $$
declare visible integer;
begin
  select count(*) into visible from storage.objects
  where bucket_id = 'agenda-files';
  if visible <> 0 then
    raise exception 'FAIL 14c: an outsider reads % site files', visible;
  end if;
  raise notice 'ok 14c: an outsider reads none of them';
end;
$$;

do $$
begin
  insert into storage.objects (bucket_id, name, owner)
  values ('agenda-files',
          'a6000000-0000-4000-8000-00000000000a/photos/intruder.jpg',
          'a6000000-0000-4000-8000-000000000004');
  raise exception 'FAIL 14d: an outsider filed into somebody else''s project';
exception
  when insufficient_privilege then
    raise notice 'ok 14d: and cannot file into it';
end;
$$;

-- Nothing is deleted. The tables in 0024 and 0090 have no DELETE policy and
-- neither does the store behind them, so a photograph filed in error is
-- archived by the row that points at it rather than removed from under it.
reset role;
set role authenticated;
set local request.jwt.claim.sub = 'a6000000-0000-4000-8000-000000000003';

do $$
declare removed integer;
begin
  delete from storage.objects where bucket_id = 'agenda-files';
  get diagnostics removed = row_count;
  if removed <> 0 then
    raise exception 'FAIL 14e: a member deleted % site files', removed;
  end if;
  raise notice 'ok 14e: not even a member can delete one';
exception
  when insufficient_privilege then
    raise notice 'ok 14e: not even a member can delete one';
end;
$$;

rollback;
