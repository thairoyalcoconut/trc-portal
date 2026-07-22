import { createClient } from "@/lib/supabase/server";

export type CurrentProfile = {
  id: string;
  email: string | undefined;
  full_name: string | null;
  department_id: string | null;
  department_name: string | null;
  role: "admin" | "manager" | "staff";
};

// Loads the signed-in user's profile + department name in one call.
// Every page that needs to know "who is this / what department / what role"
// should use this instead of querying Supabase directly.
export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role, department_id, departments ( name )")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  return {
    id: user.id,
    email: user.email,
    full_name: profile.full_name,
    department_id: profile.department_id,
    department_name: (profile as any).departments?.name ?? null,
    role: profile.role,
  };
}
