"use client";

import { sanitizeMemoHtml } from "@/lib/memoRichText";

export type MemoPreviewData = {
  memo_no?: string | null; // unknown ("auto") until the memo is actually saved
  memo_date: string | null;
  subject: string;
  to_recipient: string | null;
  detailsHtml: string;
  recorded_by_name: string | null;
  reviewed_by_name: string | null;
  approved_by_name: string | null;
};

function toDMY(value: string | null) {
  if (!value) return "-";
  const [y, m, d] = value.split("-");
  if (!y || !m || !d) return value;
  return `${y}/${m}/${d}`;
}

/**
* An on-screen, A4-shaped rendering of a memorandum, styled to match what
* Export PDF produces (same header/field layout, same rich-text
* formatting) — used both as a live preview while filling out the "New
* Memorandum" form and as a "Print Preview" on a saved memo's page. Sized
* in real physical units (mm) so it is also accurate if printed directly
* from the browser (Ctrl/Cmd+P), not just as an approximation.
*/
export default function MemoPrintPreview({ memo }: { memo: MemoPreviewData }) {
  const year = memo.memo_date ? memo.memo_date.slice(0, 4) : new Date().getFullYear();

return (
  <div className="overflow-x-auto rounded-md border border-gray-200 bg-gray-100 p-4">
  <div
    className="memo-print-preview mx-auto bg-white text-gray-900 shadow-md"
    style={{ width: "210mm", minHeight: "297mm", padding: "14mm", fontSize: "10pt" }}
    >
  <div className="flex items-start justify-between">
  <div>
  <div className="text-[13pt] font-bold">Thai Royal Coconut Co., Ltd.</div>
  <div className="mt-1 text-[8pt] text-gray-500">
  88 Moo 1, Tambon Tachin, Mueang Samut Sakhon, Samut Sakhon 74000, Thailand · 066-137-9999
  </div>
  <div className="text-[8pt] text-gray-500">เลขประจำตัวผู้เสียภาษี 0745567003301</div>
  </div>
  <div className="text-right">
  <div className="text-[9pt]">เลขที่ / No.</div>
  <div className="text-[11pt] font-bold">
    {memo.memo_no || `${year}/XXX (auto)`} - {toDMY(memo.memo_date)}
  </div>
  </div>
  </div>
  
  <hr className="my-3 border-gray-300" />
  
  <div className="text-center text-[15pt] font-bold">บันทึกข้อความ (MEMORANDUM)</div>
  
  <div className="mt-6 grid grid-cols-2 gap-4">
  <div>
  <div className="text-[9pt] font-bold">เรื่อง</div>
  <div className="mt-1 min-h-[26pt] rounded border border-gray-300 px-2 py-1.5">
    {memo.subject || "-"}
  </div>
  </div>
  <div>
  <div className="text-[9pt] font-bold">ถึง / เรียน</div>
  <div className="mt-1 min-h-[26pt] rounded border border-gray-300 px-2 py-1.5">
    {memo.to_recipient || "-"}
  </div>
  </div>
  </div>
  
  <div className="mt-5">
  <div className="text-[9pt] font-bold">รายละเอียด</div>
  <div
    // 9pt to match the "ผู้ตรวจสอบ/ผู้อนุมัติ" signer labels below —
    // the same base size the editor and the export PDF use.
    className="memo-rich-body mt-2 text-[9pt] leading-relaxed"
    // Sanitized again here, in addition to the server-side sanitize in
    // createMemorandum — cheap defense in depth for anything rendered
    // as raw HTML.
    dangerouslySetInnerHTML={{ __html: sanitizeMemoHtml(memo.detailsHtml) || "-" }}
    />
  </div>
  
  <div className="mt-8 text-[10pt]">จึงเรียนมาเพื่อทราบและโปรดอนุมัติ</div>
  
  <div className="mt-16 grid grid-cols-3 gap-4 text-center text-[9pt]">
    {[
      { label: "ผู้บันทึกข้อมูล", name: memo.recorded_by_name },
      { label: "ผู้ตรวจสอบ", name: memo.reviewed_by_name },
      { label: "ผู้อนุมัติ", name: memo.approved_by_name },
      ].map((s) => (
        <div key={s.label}>
        <div className="mx-auto w-4/5 border-t border-gray-400 pt-1.5 font-bold">{s.name || "-"}</div>
        <div className="text-gray-500">{s.label}</div>
        </div>
        ))}
  </div>
  </div>
  
    {/* Print CSS: hide everything except the preview block itself, and
    drop the page-shell chrome (border/shadow/gray backdrop) so a
    Ctrl/Cmd+P from this page prints just the memo. */}
  <style jsx global>{`
  @media print {
  body * {
  visibility: hidden;
  }
  .memo-print-preview,
  .memo-print-preview * {
  visibility: visible;
  }
  .memo-print-preview {
  position: absolute;
  left: 0;
  top: 0;
  width: 210mm;
  min-height: 297mm;
  box-shadow: none;
  }
  }
  .memo-rich-body p,
  .memo-rich-body div {
  margin: 0 0 0.6em 0;
  }
  .memo-rich-body p:last-child,
  .memo-rich-body div:last-child {
  margin-bottom: 0;
  }
  `}</style>
  </div>
  );
}
