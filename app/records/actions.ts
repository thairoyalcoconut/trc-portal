"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";

export async function createRecord(formData: FormData) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not signed in");

  const departmentId = String(formData.get("department_id") || "");
  if (!departmentId) throw new Error("Choose a department");
  if (profile.role !== "admin" && !profile.department_ids.includes(departmentId)) {
    throw new Error("You can only add records to your own department(s)");
  }

  const title = String(formData.get("title") || "");
  const category = String(formData.get("category") || "general");
  const notes = String(formData.get("notes") || "");

  const supabase = createClient();
  const { error } = await supabase.from("records").insert({
    department_id: departmentId,
    title,
    category,
    data: { notes },
    created_by: profile.id,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/records");
  revalidatePath("/dashboard");
}

export async function deleteRecord(formData: FormData) {
  const id = String(formData.get("id") || "");
  const supabase = createClient();
  const { error } = await supabase.from("records").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/records");
  revalidatePath("/dashboard");
}
