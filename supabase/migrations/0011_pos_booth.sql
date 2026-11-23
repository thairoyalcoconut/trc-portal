-- TRC Portal — POS-ออกบูท (booth / fair point-of-sale)
-- Run this in Supabase SQL Editor: paste -> Run
--
-- ADDITIVE ONLY. This migration creates new pos_* tables, functions and
-- policies. It does not alter or drop any existing table, column, policy
-- or row (sale_orders, purchase_requests, records, profiles, ... are
-- untouched). Safe to run once; re-running is also safe (idempotent).
--
-- Data model
--   pos_shifts        one "เปิดร้าน → ปิดร้าน" session at an event
--   pos_bills         a paid bill (unpaid open bills live only in the browser)
--   pos_bill_items    line items of a paid bill
--   pos_expenses      expenses recorded during a shift
--   pos_bill_counters per-day running number for bill codes (POS-YYMMDD-001)
--
-- Access: same department-scoping as Sales Order — Marketing members
-- (and admins) via public.in_department(). Once a shift is closed its
-- bills/expenses can no longer be added or edited (admins can still delete).

-- ============================================================
-- 1. SHIFTS
-- ============================================================
create table if not exists public.pos_shifts (
  id uuid primary key default gen_random_uuid(),
  department_id uuid references public.departments (id) on delete set null,
  event_name text not null,
  staff_name text not null,
  opened_by uuid not null references public.profiles (id),
  opening_float numeric not null default 0 check (opening_float >= 0),
  status text not null default 'open' check (status in ('open', 'closed')),
  opened_at timestamptz not null default now(),
  business_date date not null default (now() at time zone 'Asia/Bangkok')::date,
  closed_at timestamptz,
  counted_cash numeric,
  expected_cash numeric,
  report_emails text[] not null default '{}',
  email_status text,
  created_at timestamptz not null default now()
);

-- A user can only have one open shift at a time.
create unique index if not exists pos_shifts_one_open_per_user
  on public.pos_shifts (opened_by) where status = 'open';
create index if not exists pos_shifts_business_date_idx on public.pos_shifts (business_date);

-- ============================================================
-- 2. BILL CODE COUNTER  (POS-YYMMDD-001, resets every Bangkok day)
-- ============================================================
create table if not exists public.pos_bill_counters (
  business_date date primary key,
  last_number int not null default 0
);
alter table public.pos_bill_counters enable row level security;
-- No policies on purpose: only the security-definer function below touches it.

create or replace function public.next_pos_bill_code(p_date date)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_num int;
begin
  insert into public.pos_bill_counters (business_date, last_number)
  values (p_date, 1)
  on conflict (business_date) do update set last_number = public.pos_bill_counters.last_number + 1
  returning last_number into v_num;
  return 'POS-' || to_char(p_date, 'YYMMDD') || '-' || lpad(v_num::text, 3, '0');
end;
$$;

-- ============================================================
-- 3. BILLS
-- ============================================================
create table if not exists public.pos_bills (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.pos_shifts (id) on delete cascade,
  department_id uuid references public.departments (id) on delete set null,
  bill_code text unique not null default '',
  bill_no int not null,                 -- "บิล 1, 2, 3" number shown at the booth
  business_date date not null default (now() at time zone 'Asia/Bangkok')::date,
  paid_at timestamptz not null default now(),
  payment_method text not null check (payment_method in ('cash', 'transfer')),
  subtotal numeric not null default 0,
  discount numeric not null default 0,
  total numeric not null default 0,
  cash_received numeric,
  promo_applied boolean not null default false,
  promo_label text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists pos_bills_shift_idx on public.pos_bills (shift_id);
create index if not exists pos_bills_business_date_idx on public.pos_bills (business_date);

create or replace function public.set_pos_bill_code()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.bill_code is null or new.bill_code = '' then
    new.bill_code := public.next_pos_bill_code(coalesce(new.business_date, (now() at time zone 'Asia/Bangkok')::date));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_pos_bill_code on public.pos_bills;
create trigger trg_set_pos_bill_code
  before insert on public.pos_bills
  for each row execute procedure public.set_pos_bill_code();

-- ============================================================
-- 4. BILL ITEMS
-- ============================================================
create table if not exists public.pos_bill_items (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.pos_bills (id) on delete cascade,
  product_code text not null,           -- e.g. MM-LB (see lib/pos/products.ts)
  product_name text not null,           -- snapshot of the name at time of sale
  unit_price numeric not null,          -- snapshot of the price at time of sale
  quantity int not null check (quantity > 0),
  line_total numeric generated always as (unit_price * quantity) stored
);
create index if not exists pos_bill_items_bill_idx on public.pos_bill_items (bill_id);

-- ============================================================
-- 5. EXPENSES
-- ============================================================
create table if not exists public.pos_expenses (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.pos_shifts (id) on delete cascade,
  item text not null,
  amount numeric not null check (amount > 0),
  source text not null default 'drawer' check (source in ('drawer', 'other')),
  note text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists pos_expenses_shift_idx on public.pos_expenses (shift_id);

-- ============================================================
-- 6. HELPER: is this shift open and in one of my departments?
-- ============================================================
create or replace function public.pos_shift_writable(p_shift_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.pos_shifts s
    where s.id = p_shift_id
      and s.status = 'open'
      and public.in_department(s.department_id)
  );
$$;

create or replace function public.pos_shift_readable(p_shift_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.pos_shifts s
    where s.id = p_shift_id and public.in_department(s.department_id)
  );
$$;

-- ============================================================
-- 7. ROW LEVEL SECURITY
-- ============================================================
alter table public.pos_shifts enable row level security;
alter table public.pos_bills enable row level security;
alter table public.pos_bill_items enable row level security;
alter table public.pos_expenses enable row level security;

-- shifts
drop policy if exists "pos_shifts_select" on public.pos_shifts;
create policy "pos_shifts_select" on public.pos_shifts
  for select using (public.in_department(department_id));
drop policy if exists "pos_shifts_insert" on public.pos_shifts;
create policy "pos_shifts_insert" on public.pos_shifts
  for insert with check (public.in_department(department_id) and opened_by = auth.uid());
drop policy if exists "pos_shifts_update" on public.pos_shifts;
create policy "pos_shifts_update" on public.pos_shifts
  for update using (status = 'open' and public.in_department(department_id))
  with check (public.in_department(department_id));
drop policy if exists "pos_shifts_delete" on public.pos_shifts;
create policy "pos_shifts_delete" on public.pos_shifts
  for delete using (public.is_admin());

-- bills
drop policy if exists "pos_bills_select" on public.pos_bills;
create policy "pos_bills_select" on public.pos_bills
  for select using (public.in_department(department_id));
drop policy if exists "pos_bills_insert" on public.pos_bills;
create policy "pos_bills_insert" on public.pos_bills
  for insert with check (public.pos_shift_writable(shift_id) and public.in_department(department_id));
drop policy if exists "pos_bills_delete" on public.pos_bills;
create policy "pos_bills_delete" on public.pos_bills
  for delete using (
    public.is_admin()
    or (public.pos_shift_writable(shift_id) and public.current_role() in ('admin', 'manager'))
  );
-- (no update policy: a paid bill is final)

-- bill items
drop policy if exists "pos_bill_items_select" on public.pos_bill_items;
create policy "pos_bill_items_select" on public.pos_bill_items
  for select using (
    exists (select 1 from public.pos_bills b where b.id = pos_bill_items.bill_id and public.in_department(b.department_id))
  );
drop policy if exists "pos_bill_items_insert" on public.pos_bill_items;
create policy "pos_bill_items_insert" on public.pos_bill_items
  for insert with check (
    exists (select 1 from public.pos_bills b where b.id = pos_bill_items.bill_id and public.pos_shift_writable(b.shift_id))
  );

-- expenses
drop policy if exists "pos_expenses_select" on public.pos_expenses;
create policy "pos_expenses_select" on public.pos_expenses
  for select using (public.pos_shift_readable(shift_id));
drop policy if exists "pos_expenses_insert" on public.pos_expenses;
create policy "pos_expenses_insert" on public.pos_expenses
  for insert with check (public.pos_shift_writable(shift_id));
drop policy if exists "pos_expenses_delete" on public.pos_expenses;
create policy "pos_expenses_delete" on public.pos_expenses
  for delete using (public.pos_shift_writable(shift_id) or public.is_admin());

-- ============================================================
-- 8. PAY A BILL ATOMICALLY (bill + its items in one transaction)
--    security invoker: runs as the calling user, so all RLS above applies.
-- ============================================================
create or replace function public.pos_create_bill(
  p_shift_id uuid,
  p_bill_no int,
  p_payment_method text,
  p_subtotal numeric,
  p_discount numeric,
  p_total numeric,
  p_cash_received numeric,
  p_promo_applied boolean,
  p_promo_label text,
  p_items jsonb             -- [{product_code, product_name, unit_price, quantity}]
)
returns table (id uuid, bill_code text, paid_at timestamptz)
language plpgsql
security invoker set search_path = public
as $$
declare
  v_bill public.pos_bills%rowtype;
  v_dept uuid;
begin
  select s.department_id into v_dept from public.pos_shifts s where s.id = p_shift_id;

  insert into public.pos_bills (shift_id, department_id, bill_no, payment_method, subtotal, discount, total,
                                cash_received, promo_applied, promo_label, created_by)
  values (p_shift_id, v_dept, p_bill_no, p_payment_method, p_subtotal, p_discount, p_total,
          p_cash_received, p_promo_applied, p_promo_label, auth.uid())
  returning * into v_bill;

  insert into public.pos_bill_items (bill_id, product_code, product_name, unit_price, quantity)
  select v_bill.id, i->>'product_code', i->>'product_name', (i->>'unit_price')::numeric, (i->>'quantity')::int
  from jsonb_array_elements(p_items) as i;

  return query select v_bill.id, v_bill.bill_code, v_bill.paid_at;
end;
$$;
