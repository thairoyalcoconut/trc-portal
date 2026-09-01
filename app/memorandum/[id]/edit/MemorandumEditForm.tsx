"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { updateMemorandum } from "../../actions";
import RichTextEditor from "@/components/RichTextEditor";
import MemoPrintPreview from "@/components/MemoPrintPreview";

type Staff = { id: string; full_name: string | null };

type Memo = {
  id: string;
  memo_no: string;
  memo_date: string;
  subject: string;
  to_recipient: string | null;
  details: string;
  recorded_by: string | null;
  reviewed_by: string | null;
  approved_by: string | null;
};

const inputClass =
  "w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

export default function MemorandumEditForm({ memo, staff }: { memo: Memo; staff: Staff[] }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

// Seeded from the existing memo — RichTextEditor gets its starting HTML
// via defaultValue below (it owns the DOM after that), everything else
// is a normal controlled field.
const [memoDate, setMemoDate] = useState(memo.memo_date);
  const [subject, setSubject] = useState(memo.subject);
  const [toRecipient, setToRecipient] = useState(memo.to_recipient || "");
  const [detailsHtml, setDetailsHtml] = useState(memo.details || "");
  const [recordedBy, setRecordedBy] = useState(memo.recorded_by || "");
  const [reviewedBy, setReviewedBy] = useState(memo.reviewed_by || "");
  const [approvedBy, setApprovedBy] = useState(memo.approved_by || "");

const staffName = (id: string) => staff.find((s) => s.id === id)?.full_name || null;
  const previewData = useMemo(
    () => ({
      memo_no: memo.memo_no,
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

  setStatus("saving");
  const result = await updateMemorandum({
    id: memo.id,
    memo_date: String(fd.get("memo_date") || ""),
    subject: String(fd.get("subject") || ""),
    to_recipient: String(fd.get("to_recipient") || ""),
    details: String(fd.get("details") || ""),
    recorded_by: String(fd.get("recorded_by") || ""),
    reviewed_by: String(fd.get("reviewed_by") || ""),
    approved_by: String(fd.get("approved_by") || ""),
  });

  if (!result.ok) {
    setStatus("idle");
    setError(result.error);
    return;
  }

  router.push(`/memorandum/${memo.id}`);
}

const busy = status !== "idle";

return (
  <form onSubmit={handleSubmit} className="mt-4 space-y-4 rounded-lg border border-gray-200 bg-white p-4">
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
    defaultValue={memo.details || ""}
    onChange={setDetailsHtml}
    placeholder="พิมพ์รายละเอียด… เลือกข้อความแล้วใช้แถบเครื่องมือด้านบนเพื่อจัดรูปแบบ"
    />
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
  
  <div className="flex items-center gap-3 border-t border-gray-100 pt-4">
  <button
    type="submit"
    disabled={busy}
    className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
    >
    {status === "saving" ? "กำลังบันทึก…" : "Save Changes"}
  </button>
  <span className="text-xs text-gray-400">
  รูปภาพแนบเดิมจะยังอยู่ — หน้านี้ยังไม่รองรับการเพิ่ม/ลบรูปภาพ
  </span>
  </div>
  </form>
  );
}
