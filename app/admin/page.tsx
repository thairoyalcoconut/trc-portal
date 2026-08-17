import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import Nav from "@/components/Nav";
import UserAssignmentForm from "@/components/UserAssignmentForm";
import { addDepartment } from "./actions";

export default async function AdminPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  if (profile.role !== "admin") {
    return (
      <>
        <Nav profile={profile} />
        <div className="mx-auto mt-16 max-w-md rounded-lg border border-red-200 bg-red-50 p-6 text-center text-red-700">
          Admin access required.
        </div>
      </>
    );
  }

  const supabase = createClient();
  const [{ data: departments }, { data: profiles }, { data: memberships }] = await Promise.all([
    supabase.from("departments").select("id, name").order("name"),
    supabase.from("profiles").select("id, full_name, role").order("full_name"),
    supabase.from("profile_departments").select("profile_id, department_id"),
  ]);

  const assignedByUser = new Map<string, string[]>();
  (memberships ?? []).forEach((m) => {
    const list = assignedByUser.get(m.profile_id) ?? [];
    list.push(m.department_id);
    assignedByUser.set(m.profile_id, list);
  });

  return (
    <>
      <Nav profile={profile} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-xl font-semibold text-gray-800">Admin</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage departments and assign staff to one or more departments + a role.
        </p>

        <section className="mt-6 rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-medium text-gray-700">Departments</h2>
          <ul className="mb-4 flex flex-wrap gap-2">
            {(departments ?? []).map((d) => (
              <li
                key={d.id}
                className="rounded-full bg-brand-50 px-3 py-1 text-sm text-brand-700"
              >
                {d.name}
              </li>
            ))}
          </ul>
          <form action={addDepartment} className="flex gap-2">
            <input
              name="name"
              placeholder="New department name"
              required
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <button className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">
              Add
            </button>
          </form>
        </section>

        <section className="mt-8 rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-medium text-gray-700">Users</h2>
          <p className="mb-4 text-xs text-gray-400">
            Check every department a person should belong to, pick their role, then Save.
          </p>
          <div className="space-y-3">
            {(profiles ?? []).map((p) => (
              <UserAssignmentForm
                key={p.id}
                userId={p.id}
                fullName={p.full_name}
                role={p.role}
                departments={departments ?? []}
                assignedDepartmentIds={assignedByUser.get(p.id) ?? []}
              />
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
