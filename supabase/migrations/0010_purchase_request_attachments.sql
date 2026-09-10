-- TRC Portal — Purchase Request image attachments
-- Run this in Supabase SQL Editor AFTER 0009_purchase_request_items_edit.sql: paste -> Run
--
-- Mirrors 0006_memorandum_attachments.sql (same bucket shape, same RLS
-- shape) so Purchase Requests get the same "attach reference photos"
-- capability Memorandum already has — e.g. a photo of the item that needs
-- restocking, or a supplier quote screenshot.

-- ============================================================
-- 1. Storage bucket for PR attachments. Public so exported PDFs and
-- the detail page can load images by URL directly, without a signed-URL
-- round trip. Guardrails: images only, 10MB per file.
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'purchase-request-attachments',
  'purchase-request-attachments',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ============================================================
-- 2. Storage RLS — any signed-in user can upload/view (matches who can
-- create a PR at all); only admins/managers can delete an object outright
-- from Storage, matching who can edit a PR (updatePurchaseRequest in
-- ../../app/purchasing/actions.ts). In the normal flow, removing an image
-- from a PR just drops its path from image_paths below on save — this
-- delete policy exists for direct Storage cleanup, not the everyday path.
-- ============================================================
drop policy if exists "purchase_request_attachments_insert" on storage.objects;
create policy "purchase_request_attachments_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'purchase-request-attachments');

drop policy if exists "purchase_request_attachments_select" on storage.objects;
create policy "purchase_request_attachments_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'purchase-request-attachments');

drop policy if exists "purchase_request_attachments_delete" on storage.objects;
create policy "purchase_request_attachments_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'purchase-request-attachments'
    and (public.is_admin() or public.current_role() = 'manager')
  );

-- ============================================================
-- 3. New column — storage object paths for a PR's attached images.
-- ============================================================
alter table public.purchase_requests
  add column if not exists image_paths text[] not null default '{}';

-- ============================================================
-- Done. Images are uploaded client-side straight to Storage (so they
-- never pass through the Vercel serverless function body-size limit),
-- then their paths are saved on the purchase_requests row by
-- createPurchaseRequest / updatePurchaseRequest.
-- ============================================================
