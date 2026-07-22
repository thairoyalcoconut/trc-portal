-- TRC Portal — Sales Order module
-- Run this in Supabase SQL Editor: paste -> Run
-- (Replaces the earlier draft of this file — safe to run fresh if you
-- haven't run a previous version of 0002_sale_orders.sql yet.)

-- ============================================================
-- Marketing department (Sales Order lives here)
-- ============================================================
insert into public.departments (name) values ('Marketing')
on conflict (name) do nothing;

-- ============================================================
-- Counter table + function that generates "YYYY/001" style
-- order numbers, incrementing per calendar year.
-- ============================================================
create table if not exists public.sale_order_counters (
  year int primary key,
  last_number int not null default 0
);
alter table public.sale_order_counters enable row level security;
-- No policies on purpose: only the security-definer function below
-- is allowed to touch this table, never the client directly.

create or replace function public.next_sale_order_no(p_year int)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_num int;
begin
  insert into public.sale_order_counters (year, last_number)
  values (p_year, 1)
  on conflict (year) do update set last_number = public.sale_order_counters.last_number + 1
  returning last_number into v_num;
  return p_year::text || '/' || lpad(v_num::text, 3, '0');
end;
$$;

-- ============================================================
-- SALE ORDERS (header)
-- ============================================================
create table if not exists public.sale_orders (
  id uuid primary key default gen_random_uuid(),
  department_id uuid references public.departments (id) on delete set null,
  order_no text unique not null default '',
  issue_date date not null default current_date,
  customer text,
  brand text,
  shipment_date date,
  payment_term text,
  sales_representative text,
  product_description text,
  packaging_detail text,
  remark text,
  compiled_by text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_sale_order_no()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.order_no is null or new.order_no = '' then
    new.order_no := public.next_sale_order_no(extract(year from coalesce(new.issue_date, current_date))::int);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_sale_order_no on public.sale_orders;
create trigger trg_set_sale_order_no
  before insert on public.sale_orders
  for each row execute procedure public.set_sale_order_no();

-- ============================================================
-- SALE ORDER ITEMS (line items — one order can have many)
-- ============================================================
create table if not exists public.sale_order_items (
  id uuid primary key default gen_random_uuid(),
  sale_order_id uuid not null references public.sale_orders (id) on delete cascade,
  position int not null default 0,
  product_name text,
  packing text,
  quantity numeric not null default 0,
  price_per_unit numeric not null default 0,
  total_price numeric generated always as (quantity * price_per_unit) stored,
  product_spec_no text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- RLS — same department-scoping pattern as records/requests.
-- Items are scoped via their parent order's department.
-- ============================================================
alter table public.sale_orders enable row level security;
alter table public.sale_order_items enable row level security;

create policy "sale_orders_select" on public.sale_orders
  for select using (department_id = public.current_department() or public.is_admin());
create policy "sale_orders_insert" on public.sale_orders
  for insert with check (department_id = public.current_department() or public.is_admin());
create policy "sale_orders_update" on public.sale_orders
  for update using (department_id = public.current_department() or public.is_admin());
create policy "sale_orders_delete" on public.sale_orders
  for delete using (
    public.is_admin()
    or (department_id = public.current_department() and public.current_role() in ('admin','manager'))
  );

create policy "sale_order_items_select" on public.sale_order_items
  for select using (
    exists (
      select 1 from public.sale_orders so
      where so.id = sale_order_items.sale_order_id
        and (so.department_id = public.current_department() or public.is_admin())
    )
  );
create policy "sale_order_items_insert" on public.sale_order_items
  for insert with check (
    exists (
      select 1 from public.sale_orders so
      where so.id = sale_order_items.sale_order_id
        and (so.department_id = public.current_department() or public.is_admin())
    )
  );
create policy "sale_order_items_update" on public.sale_order_items
  for update using (
    exists (
      select 1 from public.sale_orders so
      where so.id = sale_order_items.sale_order_id
        and (so.department_id = public.current_department() or public.is_admin())
    )
  );
create policy "sale_order_items_delete" on public.sale_order_items
  for delete using (
    exists (
      select 1 from public.sale_orders so
      where so.id = sale_order_items.sale_order_id
        and (
          public.is_admin()
          or (so.department_id = public.current_department() and public.current_role() in ('admin','manager'))
        )
    )
  );
