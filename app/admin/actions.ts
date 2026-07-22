"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";

async function requireAdmin() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") {
    throw new Error("Admin access required");
  }
  return profile;
}

export async function addDepartment(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") || "").trim();
  if (!name) return;

  const supabase = createClient();
  const { error } = await supabase.from("departments").insert({ name });
  if (error) throw new Error(error.message);

  revalidatePath("/admin");
}

export async function updateUserAssignment(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get("user_id") || "");
  const departmentId = String(formData.get("department_id") || "") || null;
  const role = String(formData.get("role") || "staff");

  const supabase = createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ department_id: departmentId, role })
    .eq("id", userId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin");
}
