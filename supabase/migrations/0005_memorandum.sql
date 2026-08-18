-- TRC Portal — Memorandum module
-- Run this in Supabase SQL Editor: paste -> Run

-- ============================================================
-- 1. Counter table + function that generates "YYYY/001" style
-- memo numbers, incrementing per calendar year (same pattern
-- as Sales Order / Purchasing Request numbering).
-- ============================================================
create table if not exists public.memorandum_counters (
  year int primary key,
  last_number int not null default 0
);
alter table public.memorandum_counters enable row level security;
-- No policies on purpose: only the security-definer function below
-- is allowed to touch this table, never the client directly.

create or replace function public.next_memo_no(p_year int)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_num int;
begin
  insert into public.memorandum_counters (year, last_number)
  values (p_year, 1)
  on conflict (year) do update set last_number = public.memorandum_counters.last_number + 1
  returning last_number into v_num;
  return p_year::text || '/' || lpad(v_num::text, 3, '0');
end;
$$;

-- ============================================================
-- 2. MEMORANDUMS
-- ============================================================
create table if not exists public.memorandums (
  id uuid primary key default gen_random_uuid(),
  memo_no text unique not null default '',
  memo_date date not null default current_date,
  subject text not null,
  to_recipient text,
  details text not null,
  recorded_by uuid references public.profiles (id),
  reviewed_by uuid references public.profiles (id),
  approved_by uuid references public.profiles (id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_memo_no()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.memo_no is null or new.memo_no = '' then
    new.memo_no := public.next_memo_no(extract(year from coalesce(new.memo_date, current_date))::int);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_memo_no on public.memorandums;
create trigger trg_set_memo_no
  before insert on public.memorandums
  for each row execute procedure public.set_memo_no();

-- ============================================================
-- 3. STAFF DIRECTORY helper — lets any signed-in user populate a
-- recipient/reviewer/approver dropdown with every employee's name,
-- without relaxing the profiles table's own RLS (which normally
-- limits a regular staff member to seeing only their own
-- department-mates).
-- ============================================================
create or replace function public.staff_directory()
returns table (id uuid, full_name text)
language sql stable security definer set search_path = public
as $$
  select id, full_name from public.profiles order by full_name;
$$;

-- ============================================================
-- 4. RLS — memos are company-wide (like Purchasing Requests):
-- any signed-in user can read and submit one; only admins/managers
-- (or the original author) can edit or decide it.
-- ============================================================
alter table public.memorandums enable row level security;

create policy "memorandums_select" on public.memorandums
  for select using (auth.uid() is not null);
create policy "memorandums_insert" on public.memorandums
  for insert with check (created_by = auth.uid());
create policy "memorandums_update" on public.memorandums
  for update using (
    public.is_admin()
    or public.current_role() = 'manager'
    or created_by = auth.uid()
  );
create policy "memorandums_delete" on public.memorandums
  for delete using (public.is_admin() or public.current_role() = 'manager');

-- ============================================================
-- Done. New page: /memorandum — visible to every signed-in user
-- via the top nav (not tied to a single department).
-- ============================================================
