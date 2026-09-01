-- TRC Portal — non-login staff directory entries
-- Run this in Supabase SQL Editor AFTER 0006_memorandum_attachments.sql: paste -> Run
--
-- Lets an admin add a person to the memorandum signer directory
-- (recorded by / reviewed by / approved by) without that person having
-- a login account — e.g. a company executive who only ever needs to
-- appear as a signer on paper and never signs into the portal itself.

-- ============================================================
-- 1. NON_LOGIN_STAFF — name-only "signer" entries, no auth.users row.
-- ============================================================
create table if not exists public.non_login_staff (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  created_at timestamptz not null default now()
);
alter table public.non_login_staff enable row level security;

drop policy if exists "non_login_staff_select" on public.non_login_staff;
create policy "non_login_staff_select" on public.non_login_staff
  for select using (auth.uid() is not null);

drop policy if exists "non_login_staff_admin_write" on public.non_login_staff;
create policy "non_login_staff_admin_write" on public.non_login_staff
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- 2. STAFF DIRECTORY — now returns logged-in profiles AND non-login
-- entries together, so both populate the same recorded/reviewed/
-- approved-by dropdown (see app/memorandum/MemorandumForm.tsx and
-- app/memorandum/[id]/edit/MemorandumEditForm.tsx).
-- ============================================================
create or replace function public.staff_directory()
returns table (id uuid, full_name text)
language sql stable security definer set search_path = public
as $$
  select id, full_name from public.profiles
  union all
  select id, full_name from public.non_login_staff
  order by full_name;
$$;

-- ============================================================
-- 3. memorandums.recorded_by/reviewed_by/approved_by can now point at
-- either a profiles.id or a non_login_staff.id, so the old FK to
-- profiles alone no longer holds for every value. Drop it — it was
-- never an access-control boundary, just referential integrity for
-- what used to be a single source of signer names.
-- ============================================================
alter table public.memorandums drop constraint if exists memorandums_recorded_by_fkey;
alter table public.memorandums drop constraint if exists memorandums_reviewed_by_fkey;
alter table public.memorandums drop constraint if exists memorandums_approved_by_fkey;

-- ============================================================
-- 4. Seed the requested executive as a non-login signer (safe to
-- re-run: skipped if a row with this name already exists).
-- ============================================================
insert into public.non_login_staff (full_name)
select 'คุณสุรพงษ์ หาญไกรวิไลย์'
where not exists (
  select 1 from public.non_login_staff where full_name = 'คุณสุรพงษ์ หาญไกรวิไลย์'
);

-- ============================================================
-- Done. Manage non-login signers from the Admin panel (Users
-- section) — add/remove them there, same place full names for
-- logged-in accounts are now editable.
-- ============================================================
