-- TRC Portal — Purchasing Request signers (Recorded by / Reviewed by / Approved by)
-- Run this in Supabase SQL Editor AFTER 0007_non_login_staff.sql: paste -> Run
--
-- Mirrors the memorandum module's signer pattern (see
-- supabase/migrations/0005_memorandum.sql and 0007_non_login_staff.sql):
-- Recorded by defaults to whoever is keying the PR in (their logged-in
-- account), Reviewed by / Approved by are picked from the same
-- staff_directory() dropdown (profiles + non-login signers).
--
-- No FK constraint to profiles alone — same reasoning as memorandums
-- after 0007: a value here can point at either a profiles.id or a
-- non_login_staff.id, so a single-table FK can't hold for every value.
-- RLS on purchase_requests is unaffected: these are plain data columns,
-- not part of any policy's `using`/`with check`.

alter table public.purchase_requests
  add column if not exists recorded_by uuid,
  add column if not exists reviewed_by uuid,
  add column if not exists approved_by uuid;

-- ============================================================
-- Done. app/purchasing/PurchaseRequestForm.tsx now needs the same
-- staff_directory() list as MemorandumForm; app/purchasing/page.tsx
-- and app/purchasing/[id]/page.tsx resolve the three ids to names the
-- same way app/memorandum/[id]/page.tsx does.
-- ============================================================
