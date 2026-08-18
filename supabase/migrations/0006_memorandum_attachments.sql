-- TRC Portal — Memorandum image attachments
-- Run this in Supabase SQL Editor AFTER 0005_memorandum.sql: paste -> Run

-- ============================================================
-- 1. Storage bucket for memo attachments. Public so exported PDFs
-- and the detail page can load images by URL directly, without a
-- signed-URL round trip. Guardrails: images only, 10MB per file.
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'memorandum-attachments',
  'memorandum-attachments',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ============================================================
-- 2. Storage RLS — any signed-in user can upload/view; only
-- admins/managers can delete (matches memorandums_delete).
-- ============================================================
drop policy if exists "memorandum_attachments_insert" on storage.objects;
create policy "memorandum_attachments_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'memorandum-attachments');

drop policy if exists "memorandum_attachments_select" on storage.objects;
create policy "memorandum_attachments_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'memorandum-attachments');

drop policy if exists "memorandum_attachments_delete" on storage.objects;
create policy "memorandum_attachments_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'memorandum-attachments'
    and (public.is_admin() or public.current_role() = 'manager')
  );

-- ============================================================
-- 3. New column — storage object paths for a memo's attached images.
-- ============================================================
alter table public.memorandums
  add column if not exists image_paths text[] not null default '{}';

-- ============================================================
-- Done. Images are uploaded client-side straight to Storage (so
-- they never pass through the Vercel serverless function body-size
-- limit), then their paths are saved on the memorandums row.
-- ============================================================
