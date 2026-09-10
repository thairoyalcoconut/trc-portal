-- TRC Portal — allow editing a Purchase Request's line items
-- Run this in Supabase SQL Editor AFTER 0008_purchase_request_signers.sql: paste -> Run
--
-- Why: app/purchasing/actions.ts's new updatePurchaseRequest() saves the
-- edited item list the same way updateSaleOrder() does — delete all
-- existing purchase_request_items rows for the PR, then re-insert the
-- edited set. The delete half already works for an admin/manager
-- (purchase_request_items_delete, added in 0004_multi_department.sql),
-- but purchase_request_items_insert (from 0003_purchasing.sql) only ever
-- allowed `pr.requested_by = auth.uid()` — the original submitter.
-- So a manager/admin editing someone else's PR could delete the old
-- items but then have the re-insert silently rejected by RLS.
--
-- This widens INSERT on purchase_request_items to match the existing
-- DELETE policy: the original requester (initial submission still works
-- unchanged) OR an admin/manager of the PR's department (new — needed
-- for editing).

drop policy if exists "purchase_request_items_insert" on public.purchase_request_items;
create policy "purchase_request_items_insert" on public.purchase_request_items
  for insert with check (
      exists (
        select 1 from public.purchase_requests pr
        where pr.id = purchase_request_items.purchase_request_id
          and (
            pr.requested_by = auth.uid()
            or public.is_admin()
            or (public.in_department(pr.department_id) and public.current_role() in ('admin', 'manager'))
          )
      )
    );

-- ============================================================
-- Done. Pair with the app changes that add:
--   - app/purchasing/actions.ts: updatePurchaseRequest()
--   - app/purchasing/PurchaseRequestForm.tsx: dual create/edit mode
--   - app/purchasing/[id]/edit/page.tsx: the edit route (admin/manager only)
--   - app/purchasing/[id]/page.tsx: the "Edit" link (admin/manager only)
-- ============================================================
