-- The commercial record: money, contracts, changes and the people who signed.
--
-- Everything in this file is gated twice. Once on membership, like the rest of
-- Agenda, and again on `agenda_can_view_finance` or `agenda_can_view_contracts`
-- — the per-member permissions 0024 defined and described as "the safe default
-- for money is that you were deliberately given it". A site engineer belongs
-- on the project and does not belong in the contract value.
--
-- ## Why a ledger already exists and this is still needed
--
-- 0024's `agenda_ledger` is a running record of money in and out — the thing a
-- site manager keeps. It is not a budget: it cannot say what was committed
-- before it was spent, what a change order did to the contract sum, or what is
-- forecast. Those are different questions and they need the structure below.
-- The ledger is not replaced; it stays as the cash record.
--
-- ## Money is numeric, and currency travels with it
--
-- Every amount is `numeric(16, 2)` with a currency beside it. A float for
-- money is an arithmetic error waiting for a large enough number, and a column
-- with no currency is a column that silently means ETB until the first dollar
-- contract arrives.

begin;

-- The permission 0024 forgot to give a reader.
--
-- `agenda_members.can_view_contracts` has existed since 0024 and nothing could
-- ask about it: the file created `agenda_can_view_finance` and
-- `agenda_can_view_meetings` and stopped. The column has been sitting there
-- ungated ever since, which meant "contracts" was a permission the client
-- could set and no policy consulted. Written to match its two siblings exactly
-- — same shape, same `status = 'active'`, same owner override.
create or replace function public.agenda_can_view_contracts(target_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.agenda_is_owner(target_project) or exists (
    select 1 from public.agenda_members m
    where m.project_id = target_project
      and m.user_id = auth.uid()
      -- Redundant in every policy in this file, and deliberately kept: they
      -- all ask `agenda_is_member` first, which already refuses a suspended
      -- member, so no test can tell this clause apart. It stays because the
      -- function has to be correct when called on its own — the next thing to
      -- use it may not be a policy with a membership check in front of it —
      -- and because both its siblings in 0024 say it.
      and m.status = 'active'
      and m.can_view_contracts
  );
$$;

revoke all on function public.agenda_can_view_contracts(uuid) from public, anon;
grant execute on function public.agenda_can_view_contracts(uuid) to authenticated;

create type public.agenda_money_status as enum (
  'draft', 'pending', 'submitted', 'under_review', 'approved',
  'rejected', 'partially_paid', 'paid', 'closed', 'cancelled'
);

create type public.agenda_contract_party as enum (
  'client', 'consultant', 'subcontractor', 'supplier', 'other'
);

-- ---------------------------------------------------------------------------
-- BOQ and budget
-- ---------------------------------------------------------------------------

create table if not exists public.agenda_boq_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.agenda_projects (id) on delete cascade,
  section text not null,
  code text,
  description text not null,
  -- m, m2, m3, kg, ton, pcs, litre. Free text with a list in the application
  -- rather than an enum, because a bill of quantities uses whatever the
  -- specification used and a migration per unit is not a system anybody wants.
  unit text not null default 'pcs',
  quantity numeric(16, 3) not null default 0,
  unit_price numeric(16, 2) not null default 0,
  currency text not null default 'ETB',
  -- What was actually built and actually cost, beside what was priced. The
  -- variance is the reason the two sit on one row.
  actual_quantity numeric(16, 3),
  actual_cost numeric(16, 2),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Generated rather than written by the application: `amount` is
-- quantity × price by definition, and a stored copy is a copy that can be
-- wrong.
alter table public.agenda_boq_items
  add column if not exists amount numeric(16, 2)
  generated always as (round(quantity * unit_price, 2)) stored;

create index if not exists agenda_boq_project_idx
  on public.agenda_boq_items (project_id, section, position);

create table if not exists public.agenda_budget_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.agenda_projects (id) on delete cascade,
  cost_code text not null,
  name text not null,
  original_budget numeric(16, 2) not null default 0,
  approved_changes numeric(16, 2) not null default 0,
  committed_cost numeric(16, 2) not null default 0,
  actual_cost numeric(16, 2) not null default 0,
  pending_cost numeric(16, 2) not null default 0,
  forecast_cost numeric(16, 2) not null default 0,
  currency text not null default 'ETB',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agenda_budget_code_per_project unique (project_id, cost_code)
);

-- The two figures every budget screen shows, defined once here so the
-- dashboard and the report cannot disagree about them.
alter table public.agenda_budget_items
  add column if not exists revised_budget numeric(16, 2)
  generated always as (original_budget + approved_changes) stored;
alter table public.agenda_budget_items
  add column if not exists remaining_budget numeric(16, 2)
  generated always as (original_budget + approved_changes - actual_cost - committed_cost) stored;

-- ---------------------------------------------------------------------------
-- Contracts, commitments, purchase orders
-- ---------------------------------------------------------------------------

create table if not exists public.agenda_contracts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.agenda_projects (id) on delete cascade,
  number text not null,
  party public.agenda_contract_party not null default 'subcontractor',
  company_name text not null,
  company_id uuid references public.profiles (id) on delete set null,
  scope text,
  original_value numeric(16, 2) not null default 0,
  approved_changes numeric(16, 2) not null default 0,
  currency text not null default 'ETB',
  start_date date,
  end_date date,
  status public.agenda_money_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agenda_contract_number_per_project unique (project_id, number)
);

alter table public.agenda_contracts
  add column if not exists current_value numeric(16, 2)
  generated always as (original_value + approved_changes) stored;

create table if not exists public.agenda_commitments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.agenda_projects (id) on delete cascade,
  contract_id uuid references public.agenda_contracts (id) on delete set null,
  budget_item_id uuid references public.agenda_budget_items (id) on delete set null,
  number text not null,
  title text not null,
  company_name text,
  original_amount numeric(16, 2) not null default 0,
  approved_changes numeric(16, 2) not null default 0,
  currency text not null default 'ETB',
  status public.agenda_money_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agenda_commitment_number_per_project unique (project_id, number)
);

create table if not exists public.agenda_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.agenda_projects (id) on delete cascade,
  commitment_id uuid references public.agenda_commitments (id) on delete set null,
  number text not null,
  supplier_name text not null,
  supplier_id uuid references public.profiles (id) on delete set null,
  -- The submittal the material was approved on. This is the brief's third
  -- chain: submittal, material approval, purchase order, delivery, daily log.
  submittal_id uuid references public.agenda_submittals (id) on delete set null,
  delivery_date date,
  delivery_location text,
  currency text not null default 'ETB',
  requested_by uuid references public.profiles (id) on delete set null,
  approved_by uuid references public.profiles (id) on delete set null,
  status public.agenda_money_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agenda_po_number_per_project unique (project_id, number)
);

create table if not exists public.agenda_purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.agenda_purchase_orders (id) on delete cascade,
  project_id uuid not null references public.agenda_projects (id) on delete cascade,
  description text not null,
  unit text not null default 'pcs',
  quantity numeric(16, 3) not null default 0,
  unit_price numeric(16, 2) not null default 0,
  delivered_quantity numeric(16, 3) not null default 0,
  position integer not null default 0
);

alter table public.agenda_purchase_order_items
  add column if not exists amount numeric(16, 2)
  generated always as (round(quantity * unit_price, 2)) stored;

-- ---------------------------------------------------------------------------
-- Change events and change orders
-- ---------------------------------------------------------------------------

create type public.agenda_change_reason as enum (
  'design_change', 'site_condition', 'client_request', 'material_change',
  'rfi_result', 'quantity_variation', 'other'
);

-- A change event is a thing that *might* cost money. It exists so the cost is
-- visible while it is still an argument, rather than appearing fully formed as
-- a change order nobody saw coming.
create table if not exists public.agenda_change_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.agenda_projects (id) on delete cascade,
  number text not null,
  title text not null,
  description text,
  reason public.agenda_change_reason not null default 'other',
  rfi_id uuid references public.agenda_rfis (id) on delete set null,
  drawing_revision_id uuid references public.agenda_drawing_revisions (id) on delete set null,
  potential_cost numeric(16, 2),
  potential_schedule_days integer,
  currency text not null default 'ETB',
  responsible_party text,
  status public.agenda_money_status not null default 'draft',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agenda_change_event_number_per_project unique (project_id, number)
);

create table if not exists public.agenda_change_orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.agenda_projects (id) on delete cascade,
  contract_id uuid references public.agenda_contracts (id) on delete set null,
  change_event_id uuid references public.agenda_change_events (id) on delete set null,
  number text not null,
  title text not null,
  description text,
  cost_impact numeric(16, 2) not null default 0,
  schedule_impact_days integer not null default 0,
  currency text not null default 'ETB',
  status public.agenda_money_status not null default 'draft',
  submitted_at timestamptz,
  decided_at timestamptz,
  decided_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agenda_change_order_number_per_project unique (project_id, number)
);

-- An approved change order moves the contract sum, and it does so here rather
-- than in whichever screen happened to approve it. `approved_changes` is the
-- sum of what was approved; recomputed rather than incremented, so approving,
-- reversing and re-approving cannot drift.
create or replace function public.agenda_sync_contract_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.contract_id, old.contract_id);
begin
  if target is null then
    return coalesce(new, old);
  end if;

  update public.agenda_contracts c
  set approved_changes = coalesce((
        select sum(co.cost_impact)
        from public.agenda_change_orders co
        where co.contract_id = target and co.status = 'approved'
      ), 0),
      updated_at = now()
  where c.id = target;

  return coalesce(new, old);
end;
$$;

drop trigger if exists agenda_sync_contract_changes on public.agenda_change_orders;
create trigger agenda_sync_contract_changes
  after insert or update of status, cost_impact, contract_id
  on public.agenda_change_orders
  for each row execute function public.agenda_sync_contract_changes();

-- ---------------------------------------------------------------------------
-- Invoices and payments
-- ---------------------------------------------------------------------------

create table if not exists public.agenda_invoices (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.agenda_projects (id) on delete cascade,
  contract_id uuid references public.agenda_contracts (id) on delete set null,
  commitment_id uuid references public.agenda_commitments (id) on delete set null,
  number text not null,
  party public.agenda_contract_party not null default 'subcontractor',
  company_name text not null,
  issued_on date,
  due_on date,
  amount numeric(16, 2) not null default 0,
  tax_amount numeric(16, 2) not null default 0,
  -- Retention is money earned and deliberately not yet paid. It is held back
  -- until handover, and a system that folds it into "unpaid" cannot tell a
  -- subcontractor why they are short.
  retention_amount numeric(16, 2) not null default 0,
  currency text not null default 'ETB',
  status public.agenda_money_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agenda_invoice_number_per_project unique (project_id, number)
);

alter table public.agenda_invoices
  add column if not exists total_amount numeric(16, 2)
  generated always as (amount + tax_amount - retention_amount) stored;

create table if not exists public.agenda_payments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.agenda_projects (id) on delete cascade,
  invoice_id uuid references public.agenda_invoices (id) on delete set null,
  payee_name text not null,
  paid_on date not null default current_date,
  amount numeric(16, 2) not null,
  currency text not null default 'ETB',
  -- Cash, bank transfer, cheque, Telebirr. Recorded, not processed: nothing in
  -- Medosha moves money, and a column that implies it does is a promise the
  -- system cannot keep.
  method text,
  reference text,
  approved_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint agenda_payment_positive check (amount > 0)
);

-- An invoice's status follows what has been paid against it, so "partially
-- paid" is a fact rather than something somebody remembered to set.
create or replace function public.agenda_sync_invoice_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.invoice_id, old.invoice_id);
  due numeric(16, 2);
  settled numeric(16, 2);
begin
  if target is null then
    return coalesce(new, old);
  end if;

  select total_amount into due from public.agenda_invoices where id = target;
  select coalesce(sum(amount), 0) into settled
  from public.agenda_payments where invoice_id = target;

  update public.agenda_invoices
  set status = case
        when settled <= 0 then status
        when settled >= due then 'paid'::public.agenda_money_status
        else 'partially_paid'::public.agenda_money_status
      end,
      updated_at = now()
  where id = target
    -- A rejected or draft invoice is not quietly marked paid by a stray
    -- payment row; that is a conversation, not an update.
    and status in ('approved', 'submitted', 'under_review', 'partially_paid', 'paid');

  return coalesce(new, old);
end;
$$;

drop trigger if exists agenda_sync_invoice_status on public.agenda_payments;
create trigger agenda_sync_invoice_status
  after insert or update or delete on public.agenda_payments
  for each row execute function public.agenda_sync_invoice_status();

-- ---------------------------------------------------------------------------
-- Bidding, workforce, plant, forms, approvals
-- ---------------------------------------------------------------------------

create table if not exists public.agenda_bid_packages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.agenda_projects (id) on delete cascade,
  number text not null,
  title text not null,
  scope text,
  due_at timestamptz,
  status public.agenda_money_status not null default 'draft',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agenda_bid_package_number_per_project unique (project_id, number)
);

create type public.agenda_bid_status as enum (
  'invited', 'viewed', 'submitted', 'under_review', 'awarded', 'rejected', 'withdrawn'
);

create table if not exists public.agenda_bids (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.agenda_bid_packages (id) on delete cascade,
  project_id uuid not null references public.agenda_projects (id) on delete cascade,
  bidder_name text not null,
  bidder_id uuid references public.profiles (id) on delete set null,
  amount numeric(16, 2),
  currency text not null default 'ETB',
  status public.agenda_bid_status not null default 'invited',
  submitted_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agenda_bid_once_per_bidder unique (package_id, bidder_name)
);

create table if not exists public.agenda_timesheets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.agenda_projects (id) on delete cascade,
  worker_name text not null,
  worker_id uuid references public.profiles (id) on delete set null,
  company_name text,
  worked_on date not null,
  started_at time,
  finished_at time,
  hours numeric(6, 2) not null default 0,
  overtime_hours numeric(6, 2) not null default 0,
  activity text,
  schedule_item_id uuid references public.agenda_schedule_items (id) on delete set null,
  recorded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint agenda_timesheet_hours_sane
    check (hours >= 0 and hours <= 24 and overtime_hours >= 0 and overtime_hours <= 24)
);

create index if not exists agenda_timesheets_day_idx
  on public.agenda_timesheets (project_id, worked_on desc);

create type public.agenda_equipment_status as enum (
  'available', 'in_use', 'maintenance', 'off_hire', 'broken'
);

create table if not exists public.agenda_equipment (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.agenda_projects (id) on delete cascade,
  name text not null,
  category text,
  owner_company text,
  operator_name text,
  operator_id uuid references public.profiles (id) on delete set null,
  status public.agenda_equipment_status not null default 'available',
  hours_used numeric(10, 1) not null default 0,
  last_service_on date,
  next_service_on date,
  photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A form template is a list of questions; a submission is the answers. Both
-- are jsonb, because the whole point is that a company defines its own site
-- instruction and permit without a migration.
create table if not exists public.agenda_form_templates (
  id uuid primary key default gen_random_uuid(),
  -- Null project means a template the owner reuses across their projects.
  project_id uuid references public.agenda_projects (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  description text,
  fields jsonb not null default '[]'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agenda_form_submissions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.agenda_form_templates (id) on delete cascade,
  project_id uuid not null references public.agenda_projects (id) on delete cascade,
  number text,
  answers jsonb not null default '{}'::jsonb,
  status public.agenda_review_status not null default 'draft',
  submitted_by uuid references public.profiles (id) on delete set null,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One approval chain, for everything that needs one.
--
-- A table per approvable thing would be six tables that drift. `subject_type`
-- and `subject_id` name what is being approved, `step` is the position in the
-- chain, and a row is one person's decision at one step.
create type public.agenda_approval_decision as enum (
  'pending', 'approved', 'approved_with_comments', 'rejected', 'skipped'
);

create table if not exists public.agenda_approvals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.agenda_projects (id) on delete cascade,
  subject_type text not null,
  subject_id uuid not null,
  step integer not null default 1,
  approver_id uuid references public.profiles (id) on delete set null,
  approver_role public.agenda_role,
  decision public.agenda_approval_decision not null default 'pending',
  comment text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint agenda_approval_step_unique unique (subject_type, subject_id, step)
);

create index if not exists agenda_approvals_subject_idx
  on public.agenda_approvals (subject_type, subject_id, step);
create index if not exists agenda_approvals_waiting_idx
  on public.agenda_approvals (approver_id)
  where decision = 'pending';

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
--
-- Two groups, and the difference is the whole point of the file.
--
-- `finance` tables need `agenda_can_view_finance` on top of membership.
-- `contracts` tables need `agenda_can_view_contracts`. The rest — bids,
-- timesheets, plant, forms, approvals — are site records that any member may
-- read, because knowing a crane is on site is not knowing what it cost.

do $$
declare
  t text;
  finance_tables text[] := array[
    'agenda_boq_items', 'agenda_budget_items', 'agenda_commitments',
    'agenda_purchase_orders', 'agenda_purchase_order_items',
    'agenda_change_events', 'agenda_change_orders',
    'agenda_invoices', 'agenda_payments', 'agenda_bids'
  ];
  contract_tables text[] := array['agenda_contracts'];
  site_tables text[] := array[
    'agenda_bid_packages', 'agenda_timesheets', 'agenda_equipment',
    'agenda_form_templates', 'agenda_form_submissions', 'agenda_approvals'
  ];
begin
  foreach t in array finance_tables || contract_tables || site_tables loop
    execute format('alter table public.%I enable row level security', t);
  end loop;

  foreach t in array finance_tables loop
    execute format($f$
      drop policy if exists "agenda money: read" on public.%I;
      create policy "agenda money: read" on public.%I
        for select to authenticated
        using (public.agenda_is_member(project_id)
               and (public.agenda_can_view_finance(project_id)
                    or public.agenda_is_owner(project_id)));
      drop policy if exists "agenda money: write" on public.%I;
      create policy "agenda money: write" on public.%I
        for insert to authenticated
        with check (public.agenda_is_member(project_id)
                    and (public.agenda_can_view_finance(project_id)
                         or public.agenda_is_owner(project_id)));
      drop policy if exists "agenda money: update" on public.%I;
      create policy "agenda money: update" on public.%I
        for update to authenticated
        using (public.agenda_is_member(project_id)
               and (public.agenda_can_view_finance(project_id)
                    or public.agenda_is_owner(project_id)))
        with check (public.agenda_is_member(project_id)
                    and (public.agenda_can_view_finance(project_id)
                         or public.agenda_is_owner(project_id)));
    $f$, t, t, t, t, t, t);
  end loop;

  foreach t in array contract_tables loop
    execute format($f$
      drop policy if exists "agenda contracts: read" on public.%I;
      create policy "agenda contracts: read" on public.%I
        for select to authenticated
        using (public.agenda_is_member(project_id)
               and (public.agenda_can_view_contracts(project_id)
                    or public.agenda_is_owner(project_id)));
      drop policy if exists "agenda contracts: write" on public.%I;
      create policy "agenda contracts: write" on public.%I
        for insert to authenticated
        with check (public.agenda_is_member(project_id)
                    and (public.agenda_can_view_contracts(project_id)
                         or public.agenda_is_owner(project_id)));
      drop policy if exists "agenda contracts: update" on public.%I;
      create policy "agenda contracts: update" on public.%I
        for update to authenticated
        using (public.agenda_is_member(project_id)
               and (public.agenda_can_view_contracts(project_id)
                    or public.agenda_is_owner(project_id)))
        with check (public.agenda_is_member(project_id)
                    and (public.agenda_can_view_contracts(project_id)
                         or public.agenda_is_owner(project_id)));
    $f$, t, t, t, t, t, t);
  end loop;

  foreach t in array site_tables loop
    execute format($f$
      drop policy if exists "agenda site: members read" on public.%I;
      create policy "agenda site: members read" on public.%I
        for select to authenticated
        using (public.agenda_is_member(project_id));
      drop policy if exists "agenda site: members write" on public.%I;
      create policy "agenda site: members write" on public.%I
        for insert to authenticated
        with check (public.agenda_is_member(project_id));
      drop policy if exists "agenda site: members update" on public.%I;
      create policy "agenda site: members update" on public.%I
        for update to authenticated
        using (public.agenda_is_member(project_id))
        with check (public.agenda_is_member(project_id));
    $f$, t, t, t, t, t, t);
  end loop;
end;
$$;

-- A reusable template has no project, so the loop above left it unreachable:
-- `agenda_is_member(null)` is null, and null is not true. Its own policy,
-- keyed on the owner.
drop policy if exists "agenda site: members read" on public.agenda_form_templates;
create policy "agenda forms: owner or project members read"
  on public.agenda_form_templates for select to authenticated
  using (owner_id = auth.uid()
         or (project_id is not null and public.agenda_is_member(project_id)));

drop policy if exists "agenda site: members write" on public.agenda_form_templates;
create policy "agenda forms: owner writes"
  on public.agenda_form_templates for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "agenda site: members update" on public.agenda_form_templates;
create policy "agenda forms: owner updates"
  on public.agenda_form_templates for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array[
    'agenda_boq_items', 'agenda_budget_items', 'agenda_contracts',
    'agenda_commitments', 'agenda_purchase_orders', 'agenda_change_events',
    'agenda_change_orders', 'agenda_invoices', 'agenda_bid_packages',
    'agenda_bids', 'agenda_equipment', 'agenda_form_templates',
    'agenda_form_submissions'
  ] loop
    execute format('drop trigger if exists agenda_touch_row on public.%I', t);
    execute format(
      'create trigger agenda_touch_row before update on public.%I '
      || 'for each row execute function public.agenda_touch()', t);
  end loop;
end;
$$;

commit;
