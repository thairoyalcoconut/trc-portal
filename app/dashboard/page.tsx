import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import Nav from "@/components/Nav";
import NoDepartment from "@/components/NoDepartment";
import StatusBadge from "@/components/StatusBadge";
import DashboardCharts from "./charts";

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  if (profile.departments.length === 0 && profile.role !== "admin") {
    return (
      <>
        <Nav profile={profile} />
        <NoDepartment />
      </>
    );
  }

  const supabase = createClient();

  const [{ count: recordCount }, { count: pendingCount }, { data: byCategory }] =
    await Promise.all([
      supabase.from("records").select("*", { count: "exact", head: true }),
      supabase
        .from("requests")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending"),
      supabase.from("records").select("category"),
    ]);

  const categoryCounts: Record<string, number> = {};
  (byCategory ?? []).forEach((r: any) => {
    categoryCounts[r.category] = (categoryCounts[r.category] ?? 0) + 1;
  });
  const chartData = Object.entries(categoryCounts).map(([category, count]) => ({
    category,
    count,
  }));

  const { data: recentRequests } = await supabase
    .from("requests")
    .select("id, type, status, details, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  return (
    <>
      <Nav profile={profile} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-xl font-semibold text-gray-800">
          {profile.role === "admin"
            ? "All departments"
            : profile.department_names.join(", ")}{" "}
          dashboard
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Signed in as {profile.full_name} · {profile.role}
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatCard label="Total records" value={recordCount ?? 0} />
          <StatCard label="Pending requests" value={pendingCount ?? 0} />
        </div>

        <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-medium text-gray-700">Records by category</h2>
          <DashboardCharts data={chartData} />
        </div>

        <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-medium text-gray-700">Recent requests</h2>
          {recentRequests && recentRequests.length > 0 ? (
            <ul className="divide-y divide-gray-100">
              {recentRequests.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <span className="font-medium text-gray-800">{r.type}</span>
                    {r.details ? (
                      <span className="text-gray-500"> — {r.details}</span>
                    ) : null}
                  </div>
                  <StatusBadge status={r.status} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-400">No requests yet.</p>
          )}
        </div>
      </main>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="mt-1 text-3xl font-semibold text-brand-700">{value}</div>
    </div>
  );
}
