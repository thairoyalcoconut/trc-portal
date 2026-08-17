import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import Nav from "@/components/Nav";
import StatusBadge from "@/components/StatusBadge";
import MemorandumForm from "./MemorandumForm";

export default async function MemorandumPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const supabase = createClient();
  const [{ data: memos }, { data: staff }] = await Promise.all([
    supabase
      .from("memorandums")
      .select("id, memo_no, memo_date, subject, to_recipient, status")
      .order("created_at", { ascending: false }),
    supabase.rpc("staff_directory"),
  ]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <Nav profile={profile} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-xl font-semibold text-gray-800">Memorandum</h1>
        <p className="mt-1 text-sm text-gray-500">
          Memo No. is generated automatically (YYYY/001) — no need to fill it in.
        </p>

        <MemorandumForm today={today} staff={staff ?? []} defaultRecordedBy={profile.id} />

        <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2">Memo No.</th>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Subject</th>
                <th className="px-4 py-2">To</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(memos ?? []).map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-2 font-medium text-brand-700">
                    <Link href={`/memorandum/${m.id}`} className="hover:underline">
                      {m.memo_no}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-gray-500">{m.memo_date}</td>
                  <td className="px-4 py-2 text-gray-700">{m.subject}</td>
                  <td className="px-4 py-2 text-gray-500">{m.to_recipient || "-"}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={m.status} />
                  </td>
                </tr>
              ))}
              {(memos ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                    No memorandums yet.
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
