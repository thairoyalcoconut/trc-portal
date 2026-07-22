import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import Nav from "@/components/Nav";
import NoDepartment from "@/components/NoDepartment";
import { createRecord, deleteRecord } from "./actions";

export default async function RecordsPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  if (!profile.department_id && profile.role !== "admin") {
    return (
      <>
        <Nav profile={profile} />
        <NoDepartment />
      </>
    );
  }

  const supabase = createClient();
  const { data: records } = await supabase
    .from("records")
    .select("id, title, category, data, created_at")
    .order("created_at", { ascending: false });

  const canDelete = profile.role === "admin" || profile.role === "manager";

  return (
    <>
      <Nav profile={profile} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-xl font-semibold text-gray-800">Records</h1>
        <p className="mt-1 text-sm text-gray-500">
          {profile.role === "admin"
            ? "All departments (admin view)"
            : `${profile.department_name} only — other departments can't see this`}
        </p>

        <form
          action={createRecord}
          className="mt-6 grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:grid-cols-4"
        >
          <input
            name="title"
            placeholder="Title"
            required
            className="rounded-md border border-gray-300 px-3 py-2 text-sm sm:col-span-2"
          />
          <input
            name="category"
            placeholder="Category (e.g. inventory, sales)"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <button className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Add record
          </button>
          <input
            name="notes"
            placeholder="Notes / details"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm sm:col-span-4"
          />
        </form>

        <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2">Title</th>
                <th className="px-4 py-2">Category</th>
                <th className="px-4 py-2">Notes</th>
                <th className="px-4 py-2">Created</th>
                {canDelete && <th className="px-4 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(records ?? []).map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 font-medium text-gray-800">{r.title}</td>
                  <td className="px-4 py-2 text-gray-500">{r.category}</td>
                  <td className="px-4 py-2 text-gray-500">
                    {(r.data as any)?.notes ?? ""}
                  </td>
                  <td className="px-4 py-2 text-gray-400">
                    {new Date(r.created_at).toLocaleDateString()}
                  </td>
                  {canDelete && (
                    <td className="px-4 py-2 text-right">
                      <form action={deleteRecord}>
                        <input type="hidden" name="id" value={r.id} />
                        <button className="text-xs text-red-500 hover:underline">
                          Delete
                        </button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
              {(records ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                    No records yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
