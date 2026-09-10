import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import Nav from "@/components/Nav";
import PurchaseRequestForm from "../../PurchaseRequestForm";

// Editing a purchase request after it's been submitted is limited to
// admin/manager — the same tier that can already approve/reject/delete one
// (see canDecide in ../page.tsx) — since a PR is a submitted-for-approval
// record once created. updatePurchaseRequest in ../../actions.ts enforces
// this again server-side (and RLS enforces it again at the database level),
// same three-layer pattern as app/memorandum/[id]/edit/page.tsx. This
// redirect is just so a non-admin/manager who lands here (e.g. a stale
// link) bounces back to the read-only detail page instead of seeing a form
// they can't submit.
export default async function EditPurchaseRequestPage({ params }: { params: { id: string } }) {
  const profile = await getCurrentProfile();
  if (!profile) return null;
  if (profile.role !== "admin" && profile.role !== "manager") {
    redirect(`/purchasing/${params.id}`);
  }

  const supabase = createClient();
  const [{ data: pr }, { data: items }, { data: staff }] = await Promise.all([
    supabase.from("purchase_requests").select("*").eq("id", params.id).single(),
    supabase
      .from("purchase_request_items")
      .select("*")
      .eq("purchase_request_id", params.id)
      .order("position", { ascending: true }),
    supabase.rpc("staff_directory"),
  ]);

  if (!pr) notFound();

  const formItems = (items ?? []).map((it) => ({
    item_code: it.item_code ?? "",
    description: it.description ?? "",
    qty: String(it.qty ?? ""),
    unit: it.unit ?? "",
    stock_left: String(it.stock_left ?? ""),
    date_needed: it.date_needed ?? "",
    remark: it.remark ?? "",
  }));

  return (
    <>
      <Nav profile={profile} />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Link href={`/purchasing/${pr.id}`} className="text-sm text-brand-600 hover:underline">
          ← Back to Purchasing Request {pr.pr_no}
        </Link>

        <div className="mt-4">
          <div className="text-xs uppercase tracking-wide text-gray-400">Editing Purchasing Request</div>
          <h1 className="text-2xl font-semibold text-brand-700">{pr.pr_no}</h1>
        </div>

        <PurchaseRequestForm
          today={new Date().toISOString().slice(0, 10)}
          staff={staff ?? []}
          defaultRecordedBy={profile.id}
          pr={{
            id: pr.id,
            request_date: pr.request_date,
            request_department: pr.request_department,
            division: pr.division,
            line: pr.line,
            job_no: pr.job_no,
            replaces_pr_no: pr.replaces_pr_no,
            note: pr.note,
            recorded_by: pr.recorded_by,
            reviewed_by: pr.reviewed_by,
            approved_by: pr.approved_by,
          }}
          items={formItems}
        />
      </main>
    </>
  );
}
