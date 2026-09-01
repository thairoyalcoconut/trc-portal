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

export type ActionResult = { ok: boolean; error?: string };

// Called directly from a client component (not as a <form action>), so
// it can report success/failure back to the row that triggered it
// instead of failing silently.
export async function updateUserAssignment(input: {
  userId: string;
  departmentIds: string[];
  role: string;
  fullName: string;
}): Promise<ActionResult> {
  try {
    await requireAdmin();
    const { userId, departmentIds, role, fullName } = input;

    if (!userId) return { ok: false, error: "Missing user" };
    if (!["staff", "manager", "admin"].includes(role)) {
      return { ok: false, error: "Invalid role" };
    }
    const trimmedName = fullName.trim();
    if (!trimmedName) return { ok: false, error: "Full name is required" };

    const supabase = createClient();

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ role, department_id: departmentIds[0] ?? null, full_name: trimmedName })
      .eq("id", userId);
    if (profileError) return { ok: false, error: profileError.message };

    const { error: deleteError } = await supabase
      .from("profile_departments")
      .delete()
      .eq("profile_id", userId);
    if (deleteError) return { ok: false, error: deleteError.message };

    if (departmentIds.length > 0) {
      const { error: insertError } = await supabase.from("profile_departments").insert(
        departmentIds.map((department_id) => ({
          profile_id: userId,
          department_id,
        }))
      );
      if (insertError) return { ok: false, error: insertError.message };
    }

    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Something went wrong" };
  }
}

// Non-login "signer" entries — a person who should be selectable as
// recorded/reviewed/approved-by on a memorandum (see staff_directory()
// in supabase/migrations/0007_non_login_staff.sql) without ever having a
// portal login account, e.g. a company executive who only signs on paper.
export async function addNonLoginStaff(formData: FormData) {
  await requireAdmin();
  const fullName = String(formData.get("full_name") || "").trim();
  if (!fullName) return;

  const supabase = createClient();
  const { error } = await supabase.from("non_login_staff").insert({ full_name: fullName });
  if (error) throw new Error(error.message);

  revalidatePath("/admin");
}

export async function deleteNonLoginStaff(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  if (!id) return;

  const supabase = createClient();
  const { error } = await supabase.from("non_login_staff").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin");
}
