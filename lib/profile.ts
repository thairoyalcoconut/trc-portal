import { createClient } from "@/lib/supabase/server";

export type CurrentProfile = {
  id: string;
  email: string | undefined;
  full_name: string | null;
  role: "admin" | "manager" | "staff";
  // All departments this user belongs to (can be more than one).
  departments: { id: string; name: string }[];
  department_ids: string[];
  department_names: string[];
  // Back-compat single-department fields — first department, or null.
  // Prefer `departments` / `department_ids` for anything access-related.
  department_id: string | null;
  department_name: string | null;
};

// Loads the signed-in user's profile + all department memberships in
// one call. Every page that needs to know "who is this / what
// department(s) / what role" should use this instead of querying
// Supabase directly.
export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

const [{ data: profile }, { data: memberships }] = await Promise.all([
  supabase.from("profiles").select("id, full_name, role").eq("id", user.id).single(),
  supabase
  .from("profile_departments")
  .select("departments ( id, name )")
  .eq("profile_id", user.id),
  ]);

if (!profile) return null;

const departments = (memberships ?? [])
  .map((m: any) => m.departments)
  .filter(Boolean)
  .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));

return {
  id: user.id,
  email: user.email,
  full_name: profile.full_name,
  role: profile.role,
  departments,
  department_ids: departments.map((d) => d.id),
  department_names: departments.map((d) => d.name),
  department_id: departments[0]?.id ?? null,
  department_name: departments[0]?.name ?? null,
};
}
