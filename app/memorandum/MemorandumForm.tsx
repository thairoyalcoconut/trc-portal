"use client";

import { createMemorandum } from "./actions";

type Staff = { id: string; full_name: string | null };

const inputClass =
  "w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

export default function MemorandumForm({
  today,
  staff,
  defaultRecordedBy,
}: {
  today: string;
  staff: Staff[];
  defaultRecordedBy: string;
}) {
  return (
    <details className="mt-6 rounded-lg border border-gray-200 bg-white">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-brand-700">
        + New Memorandum
      </summary>
      <form action={createMemorandum} className="space-y-4 border-t border-gray-100 p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Date</span>
            <input name="memo_date" type="date" defaultValue={today} required className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">
              To / Recipient <span className="font-normal text-gray-400">(เรียน)</span>
            </span>
            <input
              name="to_recipient"
              placeholder="e.g. ผู้บริหารและฝ่ายบัญชี"
              className={inputClass}
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Subject (เรื่อง)</span>
          <input name="subject" required className={inputClass} />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Details (รายละเอียด)</span>
          <textarea name="details" rows={5} required className={inputClass} />
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">
              Recorded by <span className="font-normal text-gray-400">(ผู้บันทึกข้อมูล)</span>
            </span>
            <select name="recorded_by" defaultValue={defaultRecordedBy} className={inputClass}>
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
            <select name="reviewed_by" defaultValue="" className={inputClass}>
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
            <select name="approved_by" defaultValue="" className={inputClass}>
              <option value="">-</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name || "-"}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex items-center gap-3">
          <button className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Submit Memorandum
          </button>
          <span className="text-xs text-gray-400">
            Memo No. is generated automatically (YYYY/001).
          </span>
        </div>
      </form>
    </details>
  );
}
