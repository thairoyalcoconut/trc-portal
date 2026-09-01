"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createMemorandum } from "./actions";
import RichTextEditor from "@/components/RichTextEditor";
import MemoPrintPreview from "@/components/MemoPrintPreview";

type Staff = { id: string; full_name: string | null };

const inputClass =
  "w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

const ATTACHMENTS_BUCKET = "memorandum-attachments";

export default function MemorandumForm({
  today,
  staff,
  defaultRecordedBy,
}: {
  today: string;
  staff: Staff[];
  defaultRecordedBy: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);

// Tracked only to drive the live preview (see MemoPrintPreview below) —
// the actual submit still reads every field straight from FormData, same
// as before, so this state can't drift the submitted values out of sync.
const [showPreview, setShowPreview] = useState(false);
  const [memoDate, setMemoDate] = useState(today);
  const [subject, setSubject] = useState("");
  const [toRecipient, setToRecipient] = useState("");
  const [detailsHtml, setDetailsHtml] = useState("");
  const [recordedBy, setRecordedBy] = useState(defaultRecordedBy);
  const [reviewedBy, setReviewedBy] = useState("");
  const [approvedBy, setApprovedBy] = useState("");

const staffName = (id: string) => staff.find((s) => s.id === id)?.full_name || null;
  const previewData = useMemo(
    () => ({
      memo_date: memoDate || null,
      subject,
      to_recipient: toRecipient || null,
      detailsHtml,
      recorded_by_name: staffName(recordedBy),
      reviewed_by_name: staffName(reviewedBy),
      approved_by_name: staffName(approvedBy),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [memoDate, subject, toRecipient, detailsHtml, recordedBy, reviewedBy, approvedBy, staff]
    );

async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault();
  setError(null);

  const form = e.currentTarget;
  const fd = new FormData(form);
  const detailsRaw = String(fd.get("details") || "");
  if (detailsRaw.replace(/<[^>]*>/g, "").trim().length === 0) {
    setError("Details is required");
    return;
  }
  const files = (fd.getAll("images") as File[]).filter((f) => f.size > 0);

  // Images upload straight from the browser to Supabase Storage —
  // skipping our server function entirely — since Vercel caps a
  // serverless function's request body well below typical photo
  // sizes. Only the resulting storage paths get sent to the server.
  const memoId = crypto.randomUUID();
  let imagePaths: string[] = [];
  let failedCount = 0;

  if (files.length > 0) {
    setStatus("uploading");
    const supabase = createClient();
    const results = await Promise.allSettled(
      files.map((file, i) => {
        const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
        const path = `${memoId}/${i}-${safeName}`;
        return supabase.storage
        .from(ATTACHMENTS_BUCKET)
        .upload(path, file, { contentType: file.type })
        .then(({ error }) => {
          if (error) throw error;
          return path;
        });
      })
      );
    imagePaths = results
    .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
    .map((r) => r.value);
    failedCount = results.length - imagePaths.length;
  }

  setStatus("saving");
  const result = await createMemorandum({
    id: memoId,
    memo_date: String(fd.get("memo_date") || ""),
    subject: String(fd.get("subject") || ""),
    to_recipient: String(fd.get("to_recipient") || ""),
    details: String(fd.get("details") || ""),
    recorded_by: String(fd.get("recorded_by") || ""),
    reviewed_by: String(fd.get("reviewed_by") || ""),
    approved_by: String(fd.get("approved_by") || ""),
    image_paths: imagePaths,
  });

  if (!result.ok) {
    setStatus("idle");
    setError(result.error);
    return;
  }

  if (failedCount > 0) {
    setError(
      `บันทึกสำเร็จ แต่มีรูปภาพ ${failedCount} รูปอัปโหลดไม่สำเร็จ — เปิดบันทึกนี้แล้วลองแนบใหม่ได้`
      );
  }

  formRef.current?.reset();
  setSubject("");
  setToRecipient("");
  setDetailsHtml("");
  setMemoDate(today);
  setRecordedBy(defaultRecordedBy);
  setReviewedBy("");
  setApprovedBy("");
  setShowPreview(false);
  router.push(`/memorandum/${result.id}`);
}

const busy = status !== "idle";

return (
  <details className="mt-6 rounded-lg border border-gray-200 bg-white">
  <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-brand-700">
  + New Memorandum
  </summary>
  <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 border-t border-gray-100 p-4">
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
  <label className="block">
  <span className="mb-1 block text-sm font-medium text-gray-700">Date</span>
  <input
    name="memo_date"
    type="date"
    value={memoDate}
    onChange={(e) => setMemoDate(e.target.value)}
    required
    className={inputClass}
    />
  </label>
  <label className="block">
  <span className="mb-1 block text-sm font-medium text-gray-700">
  To / Recipient <span className="font-normal text-gray-400">(เรียน)</span>
  </span>
  <input
    name="to_recipient"
    placeholder="e.g. ผู้บริหารและฝ่ายบัญชี"
    value={toRecipient}
    onChange={(e) => setToRecipient(e.target.value)}
    className={inputClass}
    />
  </label>
  </div>
  
  <label className="block">
  <span className="mb-1 block text-sm font-medium text-gray-700">Subject (เรื่อง)</span>
  <input
    name="subject"
    required
    value={subject}
    onChange={(e) => setSubject(e.target.value)}
    className={inputClass}
    />
  </label>
  
  <label className="block">
  <span className="mb-1 block text-sm font-medium text-gray-700">Details (รายละเอียด)</span>
  <RichTextEditor
    name="details"
    onChange={setDetailsHtml}
    placeholder="พิมพ์รายละเอียด… เลือกข้อความแล้วใช้แถบเครื่องมือด้านบนเพื่อจัดรูปแบบ"
    />
    {/* RichTextEditor posts through a hidden input, which the browser
    doesn't natively validate as "required" — emptiness is instead
    checked below in handleSubmit and, as a second layer, server-side
    in createMemorandum. */}
  </label>
  
  <label className="block">
  <span className="mb-1 block text-sm font-medium text-gray-700">
  Attach images <span className="font-normal text-gray-400">(แนบรูปภาพ, เลือกได้หลายไฟล์)</span>
  </span>
  <input
    name="images"
    type="file"
    accept="image/*"
    multiple
    className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
    />
  <span className="mt-1 block text-xs text-gray-400">
  รูปที่แนบจะแสดงในหน้ารายละเอียด และแนบต่อท้ายไฟล์ PDF ที่ export ด้วย
  </span>
  </label>
  
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
  <label className="block">
  <span className="mb-1 block text-sm font-medium text-gray-700">
  Recorded by <span className="font-normal text-gray-400">(ผู้บันทึกข้อมูล)</span>
  </span>
  <select
    name="recorded_by"
    value={recordedBy}
    onChange={(e) => setRecordedBy(e.target.value)}
    className={inputClass}
    >
    {staff.map((s) => (
      <option key={s.id} value={s.id}>
        {s.full_name || "-"}
      </option>
      ))}
  </select>
  </label>
  <label className="block">
  <span className="mb-1 block text-sm font-medium text-gray-700">
  Reviewed by <span className="font-normal text-gray-400">(ผู้ตรวจสอบ)</span>
  </span>
  <select
    name="reviewed_by"
    value={reviewedBy}
    onChange={(e) => setReviewedBy(e.target.value)}
    className={inputClass}
    >
  <option value="">-</option>
    {staff.map((s) => (
      <option key={s.id} value={s.id}>
        {s.full_name || "-"}
      </option>
      ))}
  </select>
  </label>
  <label className="block">
  <span className="mb-1 block text-sm font-medium text-gray-700">
  Approved by <span className="font-normal text-gray-400">(ผู้อนุมัติ)</span>
  </span>
  <select
    name="approved_by"
    value={approvedBy}
    onChange={(e) => setApprovedBy(e.target.value)}
    className={inputClass}
    >
  <option value="">-</option>
    {staff.map((s) => (
      <option key={s.id} value={s.id}>
        {s.full_name || "-"}
      </option>
      ))}
  </select>
  </label>
  </div>
  
  <div>
  <button
    type="button"
    onClick={() => setShowPreview((v) => !v)}
    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
    >
    {showPreview ? "Hide Preview" : "Preview"}
  </button>
  </div>
  
    {showPreview && (
    <div>
    <p className="mb-2 text-xs text-gray-400">
    ตัวอย่างหน้าตาตอน print out — จะตรงกับไฟล์ PDF ที่ export ด้วย (ไม่รวมรูปภาพแนบ ซึ่งจะต่อท้ายในไฟล์ PDF)
    </p>
    <MemoPrintPreview memo={previewData} />
    </div>
    )}
  
    {error && <p className="text-sm text-red-600">{error}</p>}
  
  <div className="flex items-center gap-3">
  <button
    type="submit"
    disabled={busy}
    className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
    >
    {status === "uploading"
      ? "กำลังอัปโหลดรูปภาพ…"
      : status === "saving"
      ? "กำลังบันทึก…"
      : "Submit Memorandum"}
  </button>
  <span className="text-xs text-gray-400">
  Memo No. is generated automatically (YYYY/001).
  </span>
  </div>
  </form>
  </details>
  );
}
