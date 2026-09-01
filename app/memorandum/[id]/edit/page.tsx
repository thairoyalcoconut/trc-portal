import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import Nav from "@/components/Nav";
import MemorandumEditForm from "./MemorandumEditForm";

// Editing a memorandum after it's been saved is limited to admin/manager —
// the same tier that can already approve/reject/delete one (see
// canDecide/canDelete in ../page.tsx) — since a memo is a signed-off record
// once created. updateMemorandum in ../../actions.ts enforces this again
// server-side; this redirect is just so a non-admin/manager who lands here
// (e.g. a stale link) bounces back to the read-only detail page instead of
// seeing a form they can't submit.
export default async function MemorandumEditPage({ params }: { params: { id: string } }) {
  const profile = await getCurrentProfile();
  if (!profile) return null;
  if (profile.role !== "admin" && profile.role !== "manager") {
    redirect(`/memorandum/${params.id}`);
  }

const supabase = createClient();
  const [{ data: memo }, { data: staff }] = await Promise.all([
    supabase.from("memorandums").select("*").eq("id", params.id).single(),
    supabase.rpc("staff_directory"),
    ]);

if (!memo) notFound();

return (
  <>
  <Nav profile={profile} />
  <main className="mx-auto max-w-4xl px-4 py-8">
  <Link href={`/memorandum/${memo.id}`} className="text-sm text-brand-600 hover:underline">
  ← Back to Memorandum
  </Link>
  
  <div className="mt-4">
  <div className="text-xs uppercase tracking-wide text-gray-400">Editing Memorandum</div>
  <h1 className="text-2xl font-semibold text-brand-700">{memo.memo_no}</h1>
  </div>
  
  <MemorandumEditForm memo={memo} staff={staff ?? []} />
  </main>
  </>
  );
}
