import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import Nav from "@/components/Nav";
import PurchaseRequestForm from "./PurchaseRequestForm";
import PurchaseRequestTable from "./PurchaseRequestTable";

export default async function PurchasingPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

const supabase = createClient();
  const [{ data: prs }, { data: staff }] = await Promise.all([
    supabase
      .from("purchase_requests")
      .select("id, pr_no, request_date, request_department, status")
      .order("created_at", { ascending: false }),
    supabase.rpc("staff_directory"),
  ]);

const today = new Date().toISOString().slice(0, 10);

return (
  <>
  <Nav profile={profile} />
  <main className="mx-auto max-w-5xl px-4 py-8">
  <h1 className="text-xl font-semibold text-gray-800">Purchasing Requests</h1>
  <p className="mt-1 text-sm text-gray-500">
  PR No. is generated automatically (PR-YYYY/001) — no need to fill it in.
  </p>
  
  <PurchaseRequestForm today={today} staff={staff ?? []} defaultRecordedBy={profile.id} />

  <PurchaseRequestTable prs={prs ?? []} />
  </main>
  </>
  );
}
