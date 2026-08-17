"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";

export async function submitRequest(formData: FormData) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not signed in");

  const departmentId = String(formData.get("department_id") || "");
  if (!departmentId) throw new Error("Choose a department");
  if (profile.role !== "admin" && !profile.department_ids.includes(departmentId)) {
    throw new Error("You can only submit requests for your own department(s)");
  }

  const type = String(formData.get("type") || "");
  const details = String(formData.get("details") || "");

  const supabase = createClient();
  const { error } = await supabase.from("requests").insert({
    department_id: departmentId,
    type,
    details,
    submitted_by: profile.id,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/requests");
  revalidatePath("/dashboard");
}

export async function decideRequest(formData: FormData) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not signed in");
  if (profile.role !== "admin" && profile.role !== "manager") {
    throw new Error("Only managers or admins can approve/reject requests");
  }

  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "");

  const supabase = createClient();
  const { error } = await supabase
    .from("requests")
    .update({ status, decided_by: profile.id, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/requests");
  revalidatePath("/dashboard");
}
