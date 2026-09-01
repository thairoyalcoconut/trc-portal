import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import Nav from "@/components/Nav";
import StatusBadge from "@/components/StatusBadge";
import MemorandumPdfButton from "@/components/MemorandumPdfButton";
import { sanitizeMemoHtml } from "@/lib/memoRichText";
import { decideMemorandum, deleteMemorandum } from "../actions";

export default async function MemorandumDetailPage({ params }: { params: { id: string } }) {
  const profile = await getCurrentProfile();
  if (!profile) return null;

const supabase = createClient();
  const { data: memo } = await supabase
  .from("memorandums")
  .select("*")
  .eq("id", params.id)
  .single();

if (!memo) notFound();

const signerIds = [memo.recorded_by, memo.reviewed_by, memo.approved_by].filter(
  (v): v is string => Boolean(v)
  );
  const { data: signers } = signerIds.length
  ? await supabase.from("profiles").select("id, full_name").in("id", signerIds)
    : { data: [] as { id: string; full_name: string | null }[] };
  const nameOf = (id: string | null) => signers?.find((s) => s.id === id)?.full_name ?? null;

const imageUrls: string[] = (memo.image_paths ?? []).map(
  (path: string) => supabase.storage.from("memorandum-attachments").getPublicUrl(path).data.publicUrl
  );

const canDecide = profile.role === "admin" || profile.role === "manager";
  const canDelete = canDecide;

return (
  <>
  <Nav profile={profile} />
  <main className="mx-auto max-w-4xl px-4 py-8">
  <Link href="/memorandum" className="text-sm text-brand-600 hover:underline">
  ← Back to Memorandum
  </Link>
  
  <div className="mt-4 rounded-lg border border-gray-200 bg-white p-6">
  <div className="flex items-start justify-between">
  <div>
  <div className="text-xs uppercase tracking-wide text-gray-400">Memorandum</div>
  <h1 className="text-2xl font-semibold text-brand-700">{memo.memo_no}</h1>
  <div className="text-sm text-gray-500">Date: {memo.memo_date}</div>
  </div>
  <div className="flex items-center gap-2">
  <StatusBadge status={memo.status} />
  <MemorandumPdfButton
    memo={{
      memo_no: memo.memo_no,
      memo_date: memo.memo_date,
      subject: memo.subject,
      to_recipient: memo.to_recipient,
      details: memo.details,
      recorded_by_name: nameOf(memo.recorded_by),
      reviewed_by_name: nameOf(memo.reviewed_by),
      approved_by_name: nameOf(memo.approved_by),
    }}
    imageUrls={imageUrls}
    />
  </div>
  </div>
  
  <dl className="mt-6 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
  <Item label="Subject (เรื่อง)" value={memo.subject} />
  <Item label="To / Recipient (เรียน)" value={memo.to_recipient} />
  </dl>
  
  <div className="mt-6">
  <div className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">
  Details (รายละเอียด)
  </div>
    {/* memo.details is either legacy plain text (no "<") or sanitized
    rich HTML written by createMemorandum — sanitized again here
    as defense in depth before it's rendered as raw HTML. Legacy
    plain text has no tags, so whitespace-pre-wrap keeps its
    newlines readable since there are no <p>/<br> to do that job. */}
  <div
    className="whitespace-pre-wrap text-sm text-gray-800 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_div]:mb-2 [&_div:last-child]:mb-0"
    dangerouslySetInnerHTML={{ __html: sanitizeMemoHtml(memo.details || "") || "-" }}
    />
  </div>
  
  <dl className="mt-6 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-3">
  <Item label="Recorded by" value={nameOf(memo.recorded_by)} />
  <Item label="Reviewed by" value={nameOf(memo.reviewed_by)} />
  <Item label="Approved by" value={nameOf(memo.approved_by)} />
  </dl>
  
    {imageUrls.length > 0 && (
    <div className="mt-6">
    <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
    Attachments (เอกสารแนบ)
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
        alt={`เอกสารแนบ ${i + 1}`}
        className="h-full w-full object-cover"
        />
      </a>
      ))}
    </div>
    </div>
    )}
  
    {canDecide && memo.status === "pending" && (
    <div className="mt-6 flex gap-2 border-t border-gray-100 pt-4">
    <form action={decideMemorandum}>
    <input type="hidden" name="id" value={memo.id} />
    <input type="hidden" name="status" value="approved" />
    <button className="rounded-md border border-green-300 px-3 py-1.5 text-xs text-green-700 hover:bg-green-50">
    Approve
    </button>
    </form>
    <form action={decideMemorandum}>
    <input type="hidden" name="id" value={memo.id} />
    <input type="hidden" name="status" value="rejected" />
    <button className="rounded-md border border-red-300 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50">
    Reject
    </button>
    </form>
    </div>
    )}
  
    {canDelete && (
    <form action={deleteMemorandum} className="mt-4 border-t border-gray-100 pt-4">
    <input type="hidden" name="id" value={memo.id} />
    <button className="text-xs text-red-500 hover:underline">Delete this memorandum</button>
    </form>
    )}
  </div>
  </main>
  </>
  );
}

function Item({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
    <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</dt>
    <dd className="mt-1 whitespace-pre-wrap text-sm text-gray-800">{value || "-"}</dd>
    </div>
    );
}
