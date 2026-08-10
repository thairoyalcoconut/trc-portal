-- TRC Portal — Purchasing Request (PR) module
-- Run this in Supabase SQL Editor: paste -> Run

-- ============================================================
-- Purchasing department (PR lives here, same pattern as
-- Marketing / Sales Order)
-- ============================================================
insert into public.departments (name) values ('Purchasing')
on conflict (name) do nothing;

-- ============================================================
-- Counter table + function that generates "PRYYYY/001" style
-- PR numbers, incrementing per calendar year.
-- ============================================================
create table if not exists public.purchase_request_counters (
  year int primary key,
  last_number int not null default 0
  );
alter table public.purchase_request_counters enable row level security;
-- No policies on purpose: only the security-definer function below
-- is allowed to touch this table, never the client directly.

create or replace function public.next_purchase_request_no(p_year int)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
v_num int;
begin
insert into public.purchase_request_counters (year, last_number)
values (p_year, 1)
on conflict (year) do update set last_number = public.purchase_request_counters.last_number + 1
returning last_number into v_num;
return 'PR' || p_year::text || '/' || lpad(v_num::text, 3, '0');
end;
$$;

-- ============================================================
-- PURCHASE REQUESTS (header)
-- ============================================================
create table if not exists public.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  department_id uuid references public.departments (id) on delete set null,
  pr_no text unique not null default '',
  request_date date not null default current_date,
  request_department text not null,
  division text,
  line text,
  job_no text,
  replaces_pr_no text,
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_by uuid references public.profiles (id),
  decided_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
  );

create or replace function public.set_purchase_request_no()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
if new.pr_no is null or new.pr_no = '' then
new.pr_no := public.next_purchase_request_no(extract(year from coalesce(new.request_date, current_date))::int);
end if;
return new;
end;
$$;

drop trigger if exists trg_set_purchase_request_no on public.purchase_requests;
create trigger trg_set_purchase_request_no
before insert on public.purchase_requests
for each row execute procedure public.set_purchase_request_no();

-- ============================================================
-- PURCHASE REQUEST ITEMS (line items — one PR can have many)
-- ============================================================
create table if not exists public.purchase_request_items (
  id uuid primary key default gen_random_uuid(),
  purchase_request_id uuid not null references public.purchase_requests (id) on delete cascade,
  position int not null default 0,
  item_code text,
  description text,
  qty numeric not null default 0,
  unit text,
  stock_left numeric not null default 0,
  date_needed date,
  remark text,
  created_at timestamptz not null default now()
  );

-- ============================================================
-- RLS — rows are always filed under the Purchasing department;
-- the requesting department (e.g. "LAB") is just data on the row,
-- not an RLS boundary, so any signed-in user can raise a PR and
-- Purchasing managers/admins process all of them.
-- ============================================================
alter table public.purchase_requests enable row level security;
alter table public.purchase_request_items enable row level security;

create policy "purchase_requests_select" on public.purchase_requests
for select using (auth.uid() is not null);
create policy "purchase_requests_insert" on public.purchase_requests
for insert with check (requested_by = auth.uid());
create policy "purchase_requests_update_decision" on public.purchase_requests
for update using (
  public.is_admin()
  or (department_id = public.current_department() and public.current_role() in ('admin', 'manager'))
  );
create policy "purchase_requests_delete" on public.purchase_requests
for delete using (
  public.is_admin()
  or (department_id = public.current_department() and public.current_role() in ('admin', 'manager'))
  );

create policy "purchase_request_items_select" on public.purchase_request_items
for select using (auth.uid() is not null);
create policy "purchase_request_items_insert" on public.purchase_request_items
for insert with check (
  exists (
  select 1 from public.purchase_requests pr
  where pr.id = purchase_request_items.purchase_request_id
  and pr.requested_by = auth.uid()
  )
  );
create policy "purchase_request_items_delete" on public.purchase_request_items
for delete using (
  exists (
  select 1 from public.purchase_requests pr
  where pr.id = purchase_request_items.purchase_request_id
  and (
  public.is_admin()
  or (pr.department_id = public.current_department() and public.current_role() in ('admin', 'manager'))
  )
  )
  );
