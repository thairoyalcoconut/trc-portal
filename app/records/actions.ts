"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";

export async function createRecord(formData: FormData) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not signed in");
  if (!profile.department_id) throw new Error("No department assigned");

  const title = String(formData.get("title") || "");
  const category = String(formData.get("category") || "general");
  const notes = String(formData.get("notes") || "");

  const supabase = createClient();
  const { error } = await supabase.from("records").insert({
    department_id: profile.department_id,
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
