"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";

type RawItem = {
  item_code?: string;
  description?: string;
  qty?: string | number;
  unit?: string;
  stock_left?: string | number;
  date_needed?: string;
  remark?: string;
};

function cleanItems(items: RawItem[]) {
  return items
    .filter((it) => (it.description || it.item_code || "").toString().trim().length > 0)
    .map((it, i) => ({
      position: i,
      item_code: (it.item_code || "").toString().trim() || null,
      description: (it.description || "").toString().trim() || null,
      qty: Number(it.qty) || 0,
      unit: (it.unit || "").toString().trim() || null,
      stock_left: Number(it.stock_left) || 0,
      date_needed: (it.date_needed || "").toString().trim() || null,
      remark: (it.remark || "").toString().trim() || null,
    }));
}

export type CreatePurchaseRequestInput = {
  id: string; // generated client-side so uploaded attachment images can be
  // namespaced under it before the row exists — same trick as
  // createMemorandum in ../memorandum/actions.ts.
  request_date: string;
  request_department: string;
  division: string;
  line: string;
  job_no: string;
  replaces_pr_no: string;
  note: string;
  recorded_by: string;
  reviewed_by: string;
  approved_by: string;
  items: RawItem[];
  image_paths: string[];
};

// Called directly from PurchaseRequestForm (a client component) rather than
// as a native <form action>, because attachment images are uploaded
// straight from the browser to Supabase Storage first — this only ever
// receives small text fields plus the resulting storage paths. Returns
// {ok, id} / {ok, error} instead of throwing/redirecting, same reasoning as
// createMemorandum: redirect() doesn't propagate correctly when a server
// action is awaited directly like this — the caller navigates itself on
// success.
export async function createPurchaseRequest(
  input: CreatePurchaseRequestInput
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "Not signed in" };

  const field = (v: string) => (v.trim().length > 0 ? v.trim() : null);
  const items = cleanItems(input.items);

  const supabase = createClient();

  // PR is a Purchasing-department module — always file it under
  // Purchasing regardless of the submitting user's own department,
  // same pattern as Sales Order always filing under Marketing.
  const { data: purchasingDept } = await supabase
    .from("departments")
    .select("id")
    .eq("name", "Purchasing")
    .single();

  const { data: pr, error } = await supabase
    .from("purchase_requests")
    .insert({
      id: input.id,
      department_id: purchasingDept?.id ?? profile.department_id,
      request_date: field(input.request_date) || new Date().toISOString().slice(0, 10),
      request_department: field(input.request_department) || "-",
      division: field(input.division),
      line: field(input.line),
      job_no: field(input.job_no),
      replaces_pr_no: field(input.replaces_pr_no),
      note: field(input.note),
      requested_by: profile.id,
      // Same pattern as createMemorandum: Recorded by defaults to whoever is
      // keying this PR in (their own account) but can be overridden in the
      // form's select, e.g. when keying in a paper PR on someone else's
      // behalf. Reviewed by / Approved by are optional at creation time.
      recorded_by: field(input.recorded_by) || profile.id,
      reviewed_by: field(input.reviewed_by),
      approved_by: field(input.approved_by),
      image_paths: input.image_paths,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  if (items.length > 0) {
    const { error: itemsError } = await supabase
      .from("purchase_request_items")
      .insert(items.map((it) => ({ ...it, purchase_request_id: pr.id })));
    if (itemsError) return { ok: false, error: itemsError.message };
  }

  revalidatePath("/purchasing");
  return { ok: true, id: pr.id };
}

// Lets an admin/manager go back and correct a PR after it was submitted —
// fix a wrong quantity, add a missed item, adjust a signer, etc. Gated to
// the same admin/manager tier as decidePurchaseRequest/deletePurchaseRequest
// below, mirroring updateMemorandum in ../memorandum/actions.ts, since a PR
// is a submitted-for-approval record once created and editing it shouldn't
// be open to every signed-in user. RLS enforces this again at the database
// level (purchase_requests_update_decision / purchase_request_items_insert
// in supabase/migrations/0004_multi_department.sql and
// 0009_purchase_request_items_edit.sql) — this check is defense in depth,
// same reasoning as updateMemorandum.
//
// Status/decided_by are intentionally left untouched here — same as
// updateMemorandum, an edit corrects the record, it doesn't reopen or
// resubmit it for approval.
//
// Same calling convention as createPurchaseRequest above (typed input,
// returns {ok,...}, no redirect()) — needed once this form started
// uploading attachment images client-side before saving.
export type UpdatePurchaseRequestInput = {
  id: string;
  request_date: string;
  request_department: string;
  division: string;
  line: string;
  job_no: string;
  replaces_pr_no: string;
  note: string;
  recorded_by: string;
  reviewed_by: string;
  approved_by: string;
  items: RawItem[];
  image_paths: string[]; // full final list for this PR — the form computes
  // this as (existing paths the user kept) + (newly uploaded paths).
};

export async function updatePurchaseRequest(
  input: UpdatePurchaseRequestInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "Not signed in" };
  if (profile.role !== "admin" && profile.role !== "manager") {
    return { ok: false, error: "Only managers or admins can edit a purchase request" };
  }

  const id = input.id;
  if (!id) return { ok: false, error: "Missing purchase request id" };

  const field = (v: string) => (v.trim().length > 0 ? v.trim() : null);
  const items = cleanItems(input.items);

  const supabase = createClient();

  const { error } = await supabase
    .from("purchase_requests")
    .update({
      request_date: field(input.request_date) || new Date().toISOString().slice(0, 10),
      request_department: field(input.request_department) || "-",
      division: field(input.division),
      line: field(input.line),
      job_no: field(input.job_no),
      replaces_pr_no: field(input.replaces_pr_no),
      note: field(input.note),
      recorded_by: field(input.recorded_by) || profile.id,
      reviewed_by: field(input.reviewed_by),
      approved_by: field(input.approved_by),
      image_paths: input.image_paths,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  // Replace all line items with the edited set (simplest reliable
  // approach for a small internal form — delete then re-insert, same
  // pattern as updateSaleOrder in ../sales/actions.ts).
  const { error: deleteError } = await supabase
    .from("purchase_request_items")
    .delete()
    .eq("purchase_request_id", id);
  if (deleteError) return { ok: false, error: deleteError.message };

  if (items.length > 0) {
    const { error: itemsError } = await supabase
      .from("purchase_request_items")
      .insert(items.map((it) => ({ ...it, purchase_request_id: id })));
    if (itemsError) return { ok: false, error: itemsError.message };
  }

  revalidatePath("/purchasing");
  revalidatePath(`/purchasing/${id}`);
  return { ok: true };
}

export async function decidePurchaseRequest(formData: FormData) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not signed in");
  if (profile.role !== "admin" && profile.role !== "manager") {
    throw new Error("Only managers or admins can approve/reject purchase requests");
  }

const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "");

const supabase = createClient();
  const { error } = await supabase
  .from("purchase_requests")
  .update({ status, decided_by: profile.id, updated_at: new Date().toISOString() })
  .eq("id", id);
  if (error) throw new Error(error.message);

revalidatePath("/purchasing");
  revalidatePath(`/purchasing/${id}`);
}

export async function deletePurchaseRequest(formData: FormData) {
  const id = String(formData.get("id") || "");
  const supabase = createClient();
  const { error } = await supabase.from("purchase_requests").delete().eq("id", id);
  if (error) throw new Error(error.message);

revalidatePath("/purchasing");
  redirect("/purchasing");
}
