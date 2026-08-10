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

export async function createPurchaseRequest(formData: FormData) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not signed in");

const field = (name: string) => {
  const v = String(formData.get(name) || "").trim();
  return v.length > 0 ? v : null;
};

let items: RawItem[] = [];
  try {
    items = JSON.parse(String(formData.get("items_json") || "[]"));
  } catch {
    items = [];
  }
  const cleanItems = items
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
    department_id: purchasingDept?.id ?? profile.department_id,
    request_date: field("request_date") || new Date().toISOString().slice(0, 10),
    request_department: field("request_department") || "-",
    division: field("division"),
    line: field("line"),
    job_no: field("job_no"),
    replaces_pr_no: field("replaces_pr_no"),
    note: field("note"),
    requested_by: profile.id,
  })
  .select("id")
  .single();

if (error) throw new Error(error.message);

if (cleanItems.length > 0) {
  const { error: itemsError } = await supabase
  .from("purchase_request_items")
  .insert(cleanItems.map((it) => ({ ...it, purchase_request_id: pr.id })));
  if (itemsError) throw new Error(itemsError.message);
}

revalidatePath("/purchasing");
  redirect(`/purchasing/${pr.id}`);
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
