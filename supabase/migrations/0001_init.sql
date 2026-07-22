-- TRC Portal — initial schema
-- Run this once in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run
-- (or via `supabase db push` if you use the Supabase CLI)

-- ============================================================
-- 1. DEPARTMENTS
-- ============================================================
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  created_at timestamptz not null default now()
);

-- Seed with placeholder departments — rename/add/remove these later
-- from the Admin panel or directly in this table.
insert into public.departments (name) values
  ('Sales'),
  ('Production'),
  ('Warehouse & Inventory'),
  ('Export / QA'),
  ('Admin & Finance')
on conflict (name) do nothing;

-- ============================================================
-- 2. PROFILES (one row per auth user)
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  department_id uuid references public.departments (id) on delete set null,
  role text not null default 'staff' check (role in ('admin', 'manager', 'staff')),
  created_at timestamptz not null default now()
);

-- Auto-create a profile row whenever someone signs up.
-- New users start as 'staff' with no department — an admin assigns
-- them a department + role from the Admin panel.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Helper functions (security definer so they can read profiles
-- without recursively triggering RLS on profiles itself).
create or replace function public.current_department()
returns uuid
language sql stable security definer set search_path = public
as $$
  select department_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_role()
returns text
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()) = 'admin', false);
$$;

-- ============================================================
-- 3. RECORDS (department data — flexible: use "category" +
--    "data" jsonb to store whatever fields a department needs,
--    e.g. category = 'inventory_count', data = {"item": "...", "qty": 120})
-- ============================================================
create table if not exists public.records (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments (id) on delete cascade,
  category text not null default 'general',
  title text not null,
  data jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 4. REQUESTS (forms / approval workflow)
-- ============================================================
create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments (id) on delete cascade,
  type text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  details text,
  data jsonb not null default '{}'::jsonb,
  submitted_by uuid references public.profiles (id),
  decided_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 5. ROW LEVEL SECURITY — this is what keeps each department's
--    data separate. A user only ever sees rows for their own
--    department; admins see everything.
-- ============================================================
alter table public.departments enable row level security;
alter table public.profiles enable row level security;
alter table public.records enable row level security;
alter table public.requests enable row level security;

-- Departments: everyone logged in can see the list of departments
-- (needed to render names), only admins can modify.
create policy "departments_select_all" on public.departments
  for select using (auth.uid() is not null);
create policy "departments_admin_write" on public.departments
  for all using (public.is_admin()) with check (public.is_admin());

-- Profiles: see your own profile, your department's teammates, or
-- everything if you're an admin. Only admins can change department/role.
create policy "profiles_select" on public.profiles
  for select using (
    id = auth.uid()
    or department_id = public.current_department()
    or public.is_admin()
  );
create policy "profiles_update_own_name" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles_admin_write" on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- Records: strictly scoped to your own department (or admin = all).
create policy "records_select" on public.records
  for select using (department_id = public.current_department() or public.is_admin());
create policy "records_insert" on public.records
  for insert with check (department_id = public.current_department() or public.is_admin());
create policy "records_update" on public.records
  for update using (department_id = public.current_department() or public.is_admin());
create policy "records_delete" on public.records
  for delete using (
    public.is_admin()
    or (department_id = public.current_department() and public.current_role() in ('admin','manager'))
  );

-- Requests: same department scoping. Any staff can submit; only
-- managers/admins of that department can approve or reject.
create policy "requests_select" on public.requests
  for select using (department_id = public.current_department() or public.is_admin());
create policy "requests_insert" on public.requests
  for insert with check (
    department_id = public.current_department()
    and submitted_by = auth.uid()
  );
create policy "requests_update_decision" on public.requests
  for update using (
    public.is_admin()
    or (department_id = public.current_department() and public.current_role() in ('admin','manager'))
  );

-- ============================================================
-- Done. Next step: create your first user via Sign Up on the
-- login page, then in Supabase Table Editor set that user's
-- profiles.role = 'admin' so you can access the Admin panel.
-- ============================================================
