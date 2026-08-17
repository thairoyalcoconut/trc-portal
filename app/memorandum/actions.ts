"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";

export async function createMemorandum(formData: FormData) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not signed in");

  const field = (name: string) => {
    const v = String(formData.get(name) || "").trim();
    return v.length > 0 ? v : null;
  };

  const subject = field("subject");
  const details = field("details");
  if (!subject) throw new Error("Subject is required");
  if (!details) throw new Error("Details is required");

  const supabase = createClient();
  const { data: memo, error } = await supabase
    .from("memorandums")
    .insert({
      memo_date: field("memo_date") || new Date().toISOString().slice(0, 10),
      subject,
      to_recipient: field("to_recipient"),
      details,
      recorded_by: field("recorded_by") || profile.id,
      reviewed_by: field("reviewed_by"),
      approved_by: field("approved_by"),
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  revalidatePath("/memorandum");
  redirect(`/memorandum/${memo.id}`);
}

export async function decideMemorandum(formData: FormData) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not signed in");
  if (profile.role !== "admin" && profile.role !== "manager") {
    throw new Error("Only managers or admins can approve/reject a memorandum");
  }

  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "");

  const supabase = createClient();
  const { error } = await supabase
    .from("memorandums")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/memorandum");
  revalidatePath(`/memorandum/${id}`);
}

export async function deleteMemorandum(formData: FormData) {
  const id = String(formData.get("id") || "");
  const supabase = createClient();
  const { error } = await supabase.from("memorandums").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/memorandum");
  redirect("/memorandum");
}
