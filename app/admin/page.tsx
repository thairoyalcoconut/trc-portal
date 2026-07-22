import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import Nav from "@/components/Nav";
import { addDepartment, updateUserAssignment } from "./actions";

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
  const [{ data: departments }, { data: profiles }] = await Promise.all([
    supabase.from("departments").select("id, name").order("name"),
    supabase
      .from("profiles")
      .select("id, full_name, role, department_id")
      .order("full_name"),
  ]);

  return (
    <>
      <Nav profile={profile} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-xl font-semibold text-gray-800">Admin</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage departments and assign staff to a department + role.
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
          <div className="space-y-3">
            {(profiles ?? []).map((p) => (
              <form
                key={p.id}
                action={updateUserAssignment}
                className="flex flex-wrap items-center gap-3 rounded-md border border-gray-100 p-3"
              >
                <input type="hidden" name="user_id" value={p.id} />
                <span className="w-40 truncate text-sm font-medium text-gray-800">
                  {p.full_name || p.id}
                </span>
                <select
                  name="department_id"
                  defaultValue={p.department_id ?? ""}
                  className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                >
                  <option value="">— No department —</option>
                  {(departments ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <select
                  name="role"
                  defaultValue={p.role}
                  className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                >
                  <option value="staff">staff</option>
                  <option value="manager">manager</option>
                  <option value="admin">admin</option>
                </select>
                <button className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                  Save
                </button>
              </form>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
