"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";

type RawItem = {
  product_name?: string;
  packing?: string;
  quantity?: string | number;
  price_per_unit?: string | number;
  product_spec_no?: string;
};

export async function createSaleOrder(formData: FormData) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not signed in");
  if (!profile.department_id) throw new Error("No department assigned");

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
    .filter((it) => (it.product_name || "").toString().trim().length > 0)
    .map((it, i) => ({
      position: i,
      product_name: (it.product_name || "").toString().trim(),
      packing: (it.packing || "").toString().trim() || null,
      quantity: Number(it.quantity) || 0,
      price_per_unit: Number(it.price_per_unit) || 0,
      product_spec_no: (it.product_spec_no || "").toString().trim() || null,
    }));

  const supabase = createClient();
  const { data: order, error } = await supabase
    .from("sale_orders")
    .insert({
      department_id: profile.department_id,
      issue_date: field("issue_date") || new Date().toISOString().slice(0, 10),
      customer: field("customer"),
      brand: field("brand"),
      shipment_date: field("shipment_date"),
      payment_term: field("payment_term"),
      sales_representative: field("sales_representative"),
      product_description: field("product_description"),
      packaging_detail: field("packaging_detail"),
      remark: field("remark"),
      compiled_by: field("compiled_by") || profile.full_name,
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  if (cleanItems.length > 0) {
    const { error: itemsError } = await supabase
      .from("sale_order_items")
      .insert(cleanItems.map((it) => ({ ...it, sale_order_id: order.id })));
    if (itemsError) throw new Error(itemsError.message);
  }

  revalidatePath("/sales");
  redirect(`/sales/${order.id}`);
}

export async function deleteSaleOrder(formData: FormData) {
  const id = String(formData.get("id") || "");
  const supabase = createClient();
  const { error } = await supabase.from("sale_orders").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/sales");
  redirect("/sales");
}
