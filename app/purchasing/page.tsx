import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import Nav from "@/components/Nav";
import StatusBadge from "@/components/StatusBadge";
import PurchaseRequestForm from "./PurchaseRequestForm";

export default async function PurchasingPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

const supabase = createClient();
  const { data: prs } = await supabase
  .from("purchase_requests")
  .select("id, pr_no, request_date, request_department, status")
  .order("created_at", { ascending: false });

const today = new Date().toISOString().slice(0, 10);

return (
  <>
  <Nav profile={profile} />
  <main className="mx-auto max-w-5xl px-4 py-8">
  <h1 className="text-xl font-semibold text-gray-800">Purchasing Requests</h1>
  <p className="mt-1 text-sm text-gray-500">
  PR No. is generated automatically (PR-YYYY/001) — no need to fill it in.
  </p>
  
  <PurchaseRequestForm today={today} />
  
  <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
  <table className="min-w-full divide-y divide-gray-100 text-sm">
  <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
  <tr>
  <th className="px-4 py-2">PR No.</th>
  <th className="px-4 py-2">Date</th>
  <th className="px-4 py-2">Department</th>
  <th className="px-4 py-2">Status</th>
  </tr>
  </thead>
  <tbody className="divide-y divide-gray-100">
    {(prs ?? []).map((p) => (
    <tr key={p.id}>
    <td className="px-4 py-2 font-medium text-brand-700">
    <Link href={`/purchasing/${p.id}`} className="hover:underline">
      {p.pr_no}
    </Link>
    </td>
    <td className="px-4 py-2 text-gray-500">{p.request_date}</td>
    <td className="px-4 py-2 text-gray-700">{p.request_department}</td>
    <td className="px-4 py-2">
    <StatusBadge status={p.status} />
    </td>
    </tr>
    ))}
    {(prs ?? []).length === 0 && (
    <tr>
    <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
    No purchasing requests yet.
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
</>
