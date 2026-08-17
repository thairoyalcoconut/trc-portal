-- TRC Portal — Multi-department support
-- Run this in Supabase SQL Editor: paste -> Run
--
-- Lets a user belong to more than one department. Adds a
-- profile_departments join table as the new source of truth for
-- "which department(s) is this user in", backfills it from the old
-- single profiles.department_id column, and updates every RLS policy
-- that used to check `department_id = current_department()` to instead
-- check membership via the new public.in_department() helper.
--
-- profiles.department_id is kept (now just "primary/first department",
-- used for display fallbacks) — nothing reads it as the access-control
-- boundary anymore after this migration.

-- ============================================================
-- 1. JOIN TABLE
-- ============================================================
create table if not exists public.profile_departments (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  department_id uuid not null references public.departments (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, department_id)
);
create index if not exists profile_departments_department_id_idx
  on public.profile_departments (department_id);

alter table public.profile_departments enable row level security;

-- Backfill from the existing single-department column.
insert into public.profile_departments (profile_id, department_id)
select id, department_id from public.profiles where department_id is not null
on conflict do nothing;

-- ============================================================
-- 2. HELPER FUNCTIONS (security definer so they can read
--    profile_departments without recursively triggering RLS on it).
-- ============================================================
create or replace function public.in_department(dept_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_admin() or exists (
    select 1 from public.profile_departments
    where profile_id = auth.uid() and department_id = dept_id
  );
$$;

create or replace function public.shares_department_with(target_profile_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.profile_departments my
    join public.profile_departments their
      on my.department_id = their.department_id
    where my.profile_id = auth.uid()
      and their.profile_id = target_profile_id
  );
$$;

-- ============================================================
-- 3. PROFILE_DEPARTMENTS policies
-- ============================================================
drop policy if exists "profile_departments_select" on public.profile_departments;
create policy "profile_departments_select" on public.profile_departments
  for select using (
    profile_id = auth.uid()
    or public.is_admin()
    or public.shares_department_with(profile_id)
  );

drop policy if exists "profile_departments_admin_write" on public.profile_departments;
create policy "profile_departments_admin_write" on public.profile_departments
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- 4. PROFILES — teammate visibility now means "shares a department"
--    instead of "same single department_id".
-- ============================================================
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (
    id = auth.uid()
    or public.is_admin()
    or public.shares_department_with(id)
  );

-- ============================================================
-- 5. RECORDS
-- ============================================================
drop policy if exists "records_select" on public.records;
create policy "records_select" on public.records
  for select using (public.in_department(department_id));

drop policy if exists "records_insert" on public.records;
create policy "records_insert" on public.records
  for insert with check (public.in_department(department_id));

drop policy if exists "records_update" on public.records;
create policy "records_update" on public.records
  for update using (public.in_department(department_id));

drop policy if exists "records_delete" on public.records;
create policy "records_delete" on public.records
  for delete using (
    public.is_admin()
    or (public.in_department(department_id) and public.current_role() in ('admin','manager'))
  );

-- ============================================================
-- 6. REQUESTS
-- ============================================================
drop policy if exists "requests_select" on public.requests;
create policy "requests_select" on public.requests
  for select using (public.in_department(department_id));

drop policy if exists "requests_insert" on public.requests;
create policy "requests_insert" on public.requests
  for insert with check (
    public.in_department(department_id)
    and submitted_by = auth.uid()
  );

drop policy if exists "requests_update_decision" on public.requests;
create policy "requests_update_decision" on public.requests
  for update using (
    public.is_admin()
    or (public.in_department(department_id) and public.current_role() in ('admin','manager'))
  );

-- ============================================================
-- 7. SALE ORDERS (Marketing module — only the delete/update-by-
--    equality policies actually change; select/insert already worked
--    off current_department() the same way).
-- ============================================================
drop policy if exists "sale_orders_select" on public.sale_orders;
create policy "sale_orders_select" on public.sale_orders
  for select using (public.in_department(department_id));

drop policy if exists "sale_orders_insert" on public.sale_orders;
create policy "sale_orders_insert" on public.sale_orders
  for insert with check (public.in_department(department_id));

drop policy if exists "sale_orders_update" on public.sale_orders;
create policy "sale_orders_update" on public.sale_orders
  for update using (public.in_department(department_id));

drop policy if exists "sale_orders_delete" on public.sale_orders;
create policy "sale_orders_delete" on public.sale_orders
  for delete using (
    public.is_admin()
    or (public.in_department(department_id) and public.current_role() in ('admin','manager'))
  );

drop policy if exists "sale_order_items_select" on public.sale_order_items;
create policy "sale_order_items_select" on public.sale_order_items
  for select using (
    exists (
      select 1 from public.sale_orders so
      where so.id = sale_order_items.sale_order_id
        and public.in_department(so.department_id)
    )
  );

drop policy if exists "sale_order_items_insert" on public.sale_order_items;
create policy "sale_order_items_insert" on public.sale_order_items
  for insert with check (
    exists (
      select 1 from public.sale_orders so
      where so.id = sale_order_items.sale_order_id
        and public.in_department(so.department_id)
    )
  );

drop policy if exists "sale_order_items_update" on public.sale_order_items;
create policy "sale_order_items_update" on public.sale_order_items
  for update using (
    exists (
      select 1 from public.sale_orders so
      where so.id = sale_order_items.sale_order_id
        and public.in_department(so.department_id)
    )
  );

drop policy if exists "sale_order_items_delete" on public.sale_order_items;
create policy "sale_order_items_delete" on public.sale_order_items
  for delete using (
    exists (
      select 1 from public.sale_orders so
      where so.id = sale_order_items.sale_order_id
        and (
          public.is_admin()
          or (public.in_department(so.department_id) and public.current_role() in ('admin','manager'))
        )
    )
  );

-- ============================================================
-- 8. PURCHASE REQUESTS (Purchasing module — update/delete were the
--    only policies keyed off current_department()).
-- ============================================================
drop policy if exists "purchase_requests_update_decision" on public.purchase_requests;
create policy "purchase_requests_update_decision" on public.purchase_requests
  for update using (
    public.is_admin()
    or (public.in_department(department_id) and public.current_role() in ('admin', 'manager'))
  );

drop policy if exists "purchase_requests_delete" on public.purchase_requests;
create policy "purchase_requests_delete" on public.purchase_requests
  for delete using (
    public.is_admin()
    or (public.in_department(department_id) and public.current_role() in ('admin', 'manager'))
  );

drop policy if exists "purchase_request_items_delete" on public.purchase_request_items;
create policy "purchase_request_items_delete" on public.purchase_request_items
  for delete using (
    exists (
      select 1 from public.purchase_requests pr
      where pr.id = purchase_request_items.purchase_request_id
        and (
          public.is_admin()
          or (public.in_department(pr.department_id) and public.current_role() in ('admin', 'manager'))
        )
    )
  );

-- ============================================================
-- Done. Existing single-department assignments already work
-- unchanged (each user was backfilled into profile_departments).
-- Assign extra departments to someone from the Admin panel.
-- ============================================================
