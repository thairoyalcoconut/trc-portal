import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import Nav from "@/components/Nav";
import StatusBadge from "@/components/StatusBadge";
import PurchaseRequestPdfButton from "@/components/PurchaseRequestPdfButton";
import { decidePurchaseRequest, deletePurchaseRequest } from "../actions";

export default async function PurchaseRequestDetailPage({ params }: { params: { id: string } }) {
  const profile = await getCurrentProfile();
  if (!profile) return null;

const supabase = createClient();
  const { data: pr } = await supabase
  .from("purchase_requests")
  .select("*")
  .eq("id", params.id)
  .single();

if (!pr) notFound();

const { data: items } = await supabase
  .from("purchase_request_items")
  .select("*")
  .eq("purchase_request_id", params.id)
  .order("position", { ascending: true });

// staff_directory() (not a direct `profiles` query) so a signer who is a
// non-login entry (see supabase/migrations/0007_non_login_staff.sql)
// resolves to their real name here too — same as memorandum/[id]/page.tsx.
const { data: allStaff } = await supabase.rpc("staff_directory");
  const nameOf = (id: string | null) =>
    (allStaff ?? []).find((s: { id: string; full_name: string | null }) => s.id === id)?.full_name ?? null;

const prItems = items ?? [];
  const canDecide = profile.role === "admin" || profile.role === "manager";

  const imageUrls: string[] = (pr.image_paths ?? []).map(
    (path: string) => supabase.storage.from("purchase-request-attachments").getPublicUrl(path).data.publicUrl
  );

return (
  <>
  <Nav profile={profile} />
  <main className="mx-auto max-w-4xl px-4 py-8">
  <Link href="/purchasing" className="text-sm text-brand-600 hover:underline">
  ← Back to Purchasing Requests
  </Link>
  <div className="mt-4 rounded-lg border border-gray-200 bg-white p-6">
  <div className="flex items-start justify-between">
  <div>
  <div className="text-xs uppercase tracking-wide text-gray-400">Purchasing Request</div>
  <h1 className="text-2xl font-semibold text-brand-700">{pr.pr_no}</h1>
  <div className="text-sm text-gray-500">Date: {formatDate(pr.request_date)}</div>
  <div className="mt-2">
  <StatusBadge status={pr.status} />
  </div>
  </div>
  <div className="flex items-center gap-2">
    {canDecide && (
    <Link
      href={`/purchasing/${pr.id}/edit`}
      className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
      >
      Edit
    </Link>
    )}
  <PurchaseRequestPdfButton
  pr={{
    ...pr,
    recorded_by_name: nameOf(pr.recorded_by),
    reviewed_by_name: nameOf(pr.reviewed_by),
    approved_by_name: nameOf(pr.approved_by),
  }}
  items={prItems}
  imageUrls={imageUrls}
  />
  </div>
  </div>
  
  <dl className="mt-6 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-3">
  <Item label="Department" value={pr.request_department} />
  <Item label="Division" value={pr.division} />
  <Item label="Line" value={pr.line} />
  <Item label="Job No." value={pr.job_no} />
  <Item label="Replaces PR No." value={pr.replaces_pr_no} />
  </dl>
  
  <div className="mt-6">
  <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
  Items requested
  </div>
  <div className="overflow-x-auto rounded-md border border-gray-200">
  <table className="min-w-full divide-y divide-gray-100 text-sm">
  <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
  <tr>
  <th className="px-3 py-2">Item code</th>
  <th className="px-3 py-2">Description</th>
  <th className="px-3 py-2 text-right">Qty</th>
  <th className="px-3 py-2">Unit</th>
  <th className="px-3 py-2 text-right">Stock left</th>
  <th className="px-3 py-2">Date needed</th>
  <th className="px-3 py-2">Remark</th>
  </tr>
  </thead>
  <tbody className="divide-y divide-gray-100">
    {prItems.map((it) => (
    <tr key={it.id}>
    <td className="px-3 py-2 text-gray-800">{it.item_code}</td>
    <td className="px-3 py-2 text-gray-800">{it.description}</td>
    <td className="px-3 py-2 text-right text-gray-500">{it.qty}</td>
    <td className="px-3 py-2 text-gray-500">{it.unit}</td>
    <td className="px-3 py-2 text-right text-gray-500">{it.stock_left}</td>
    <td className="px-3 py-2 text-gray-500">{formatDate(it.date_needed)}</td>
    <td className="px-3 py-2 text-gray-500">{it.remark}</td>
    </tr>
    ))}
    {prItems.length === 0 && (
    <tr>
    <td colSpan={7} className="px-3 py-4 text-center text-gray-400">
    No items.
    </td>
    </tr>
    )}
  </tbody>
  </table>
  </div>
  </div>
  
  <dl className="mt-6 grid grid-cols-1 gap-y-4">
  <Item label="Note" value={pr.note} />
  </dl>

    {imageUrls.length > 0 && (
    <div className="mt-6">
    <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
    Attachments
    </div>
    <div className="flex flex-wrap gap-3">
      {imageUrls.map((url, i) => (
      <a
        key={url}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block h-24 w-24 overflow-hidden rounded-md border border-gray-200"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={`Attachment ${i + 1}`}
          className="h-full w-full object-cover"
        />
      </a>
      ))}
    </div>
    </div>
    )}

  <dl className="mt-6 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-3 border-t border-gray-100 pt-4">
  <Item label="Recorded by" value={nameOf(pr.recorded_by)} />
  <Item label="Reviewed by" value={nameOf(pr.reviewed_by)} />
  <Item label="Approved by" value={nameOf(pr.approved_by)} />
  </dl>

    {canDecide && pr.status === "pending" && (
    <div className="mt-6 flex gap-2 border-t border-gray-100 pt-4">
    <form action={decidePurchaseRequest}>
    <input type="hidden" name="id" value={pr.id} />
    <input type="hidden" name="status" value="approved" />
    <button className="rounded-md border border-green-300 px-3 py-1.5 text-sm text-green-700 hover:bg-green-50">
    Approve
    </button>
    </form>
    <form action={decidePurchaseRequest}>
    <input type="hidden" name="id" value={pr.id} />
    <input type="hidden" name="status" value="rejected" />
    <button className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50">
    Reject
    </button>
    </form>
    </div>
    )}
  
    {canDecide && (
    <form action={deletePurchaseRequest} className="mt-6 border-t border-gray-100 pt-4">
    <input type="hidden" name="id" value={pr.id} />
    <button className="text-xs text-red-500 hover:underline">
    Delete this purchasing request
    </button>
    </form>
    )}
  </div>
  </main>
  </>
  );
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const [y, m, d] = value.split("-");
  return `${d}/${m}/${y}`;
  }

  function Item({ label, value }: { label: string; value: string | null }) {
    return (
  <div>
  <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</dt>
  <dd className="mt-1 whitespace-pre-wrap text-sm text-gray-800">{value || "-"}</dd>
  </div>
);
  }
