import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import Nav from "@/components/Nav";
import NoDepartment from "@/components/NoDepartment";
import StatusBadge from "@/components/StatusBadge";
import { submitRequest, decideRequest } from "./actions";

export default async function RequestsPage() {
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
  const { data: requests } = await supabase
    .from("requests")
    .select("id, type, status, details, created_at")
    .order("created_at", { ascending: false });

  const canDecide = profile.role === "admin" || profile.role === "manager";

  return (
    <>
      <Nav profile={profile} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-xl font-semibold text-gray-800">Requests</h1>
        <p className="mt-1 text-sm text-gray-500">
          Submit a request for your department; managers/admins approve or reject.
        </p>

        <form
          action={submitRequest}
          className="mt-6 grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:grid-cols-4"
        >
          <input
            name="type"
            placeholder="Request type (e.g. Purchase order, Leave)"
            required
            className="rounded-md border border-gray-300 px-3 py-2 text-sm sm:col-span-3"
          />
          <button className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Submit
          </button>
          <input
            name="details"
            placeholder="Details"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm sm:col-span-4"
          />
        </form>

        <div className="mt-6 space-y-2">
          {(requests ?? []).map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3"
            >
              <div>
                <div className="text-sm font-medium text-gray-800">{r.type}</div>
                {r.details && <div className="text-sm text-gray-500">{r.details}</div>}
                <div className="text-xs text-gray-400">
                  {new Date(r.created_at).toLocaleString()}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={r.status} />
                {canDecide && r.status === "pending" && (
                  <div className="flex gap-2">
                    <form action={decideRequest}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="status" value="approved" />
                      <button className="rounded-md border border-green-300 px-2 py-1 text-xs text-green-700 hover:bg-green-50">
                        Approve
                      </button>
                    </form>
                    <form action={decideRequest}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="status" value="rejected" />
                      <button className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50">
                        Reject
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </div>
          ))}
          {(requests ?? []).length === 0 && (
            <p className="py-6 text-center text-sm text-gray-400">No requests yet.</p>
          )}
        </div>
      </main>
    </>
  );
}
