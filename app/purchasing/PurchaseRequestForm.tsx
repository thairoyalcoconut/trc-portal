"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createPurchaseRequest, updatePurchaseRequest } from "./actions";

type Staff = { id: string; full_name: string | null };

type Item = {
  item_code: string;
  description: string;
  qty: string;
  unit: string;
  stock_left: string;
  date_needed: string;
  remark: string;
};

const ATTACHMENTS_BUCKET = "purchase-request-attachments";

// Same shape as SaleOrderDefaults in ../sales/SaleOrderForm.tsx: pass
// `pr` (with an id) to render this in edit mode against updatePurchaseRequest,
// omit it to render the create form against createPurchaseRequest.
export type PurchaseRequestDefaults = {
  id: string;
  request_date?: string | null;
  request_department?: string | null;
  division?: string | null;
  line?: string | null;
  job_no?: string | null;
  replaces_pr_no?: string | null;
  note?: string | null;
  recorded_by?: string | null;
  reviewed_by?: string | null;
  approved_by?: string | null;
  image_paths?: string[] | null;
};

const emptyItem = (): Item => ({
  item_code: "",
  description: "",
  qty: "",
  unit: "",
  stock_left: "",
  date_needed: "",
  remark: "",
});

const inputClass =
  "w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

export default function PurchaseRequestForm({
  today,
  staff,
  defaultRecordedBy,
  pr,
  items: initialItems,
}: {
  today: string;
  staff: Staff[];
  defaultRecordedBy: string;
  pr?: PurchaseRequestDefaults;
  items?: Item[];
}) {
  const router = useRouter();
  // Memoized so re-renders (e.g. typing in a field) don't spin up a fresh
  // Supabase client on every image thumbnail render — one instance per
  // mount, reused for the public-URL lookups below and for the upload in
  // handleSubmit.
  const supabase = useMemo(() => createClient(), []);
  const isEdit = Boolean(pr?.id);
  const [items, setItems] = useState<Item[]>(
    initialItems && initialItems.length > 0 ? initialItems : [emptyItem()]
  );
  // Existing attachment paths this PR already has (edit mode only) — the
  // "×" on a thumbnail below just drops it from this list, same no-undo
  // pattern as removing an item row. The final list saved on submit is
  // this (whatever's left) plus whatever new files get uploaded.
  const [keepPaths, setKeepPaths] = useState<string[]>(pr?.image_paths ?? []);
  const [status, setStatus] = useState<"idle" | "uploading" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);

  function updateItem(index: number, field: keyof Item, value: string) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)));
  }

  function addRow() {
    setItems((prev) => [...prev, emptyItem()]);
  }

  function removeRow(index: number) {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  function removeExistingImage(path: string) {
    setKeepPaths((prev) => prev.filter((p) => p !== path));
  }

  function publicUrlFor(path: string) {
    return supabase.storage.from(ATTACHMENTS_BUCKET).getPublicUrl(path).data.publicUrl;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = e.currentTarget;
    const fd = new FormData(form);
    const files = (fd.getAll("images") as File[]).filter((f) => f.size > 0);

    // New images upload straight from the browser to Supabase Storage —
    // skipping our server action entirely — since Vercel caps a serverless
    // function's request body well below typical photo sizes. Only the
    // resulting storage paths get sent to the server. Same approach as
    // MemorandumForm.tsx.
    const recordId = pr?.id ?? crypto.randomUUID();
    let uploadedPaths: string[] = [];
    let failedCount = 0;

    if (files.length > 0) {
      setStatus("uploading");
      const results = await Promise.allSettled(
        files.map((file, i) => {
          const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
          const path = `${recordId}/${Date.now()}-${i}-${safeName}`;
          return supabase.storage
            .from(ATTACHMENTS_BUCKET)
            .upload(path, file, { contentType: file.type })
            .then(({ error }) => {
              if (error) throw error;
              return path;
            });
        })
      );
      uploadedPaths = results
        .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
        .map((r) => r.value);
      failedCount = results.length - uploadedPaths.length;
    }

    const image_paths = [...keepPaths, ...uploadedPaths];

    const common = {
      request_date: String(fd.get("request_date") || ""),
      request_department: String(fd.get("request_department") || ""),
      division: String(fd.get("division") || ""),
      line: String(fd.get("line") || ""),
      job_no: String(fd.get("job_no") || ""),
      replaces_pr_no: String(fd.get("replaces_pr_no") || ""),
      note: String(fd.get("note") || ""),
      recorded_by: String(fd.get("recorded_by") || ""),
      reviewed_by: String(fd.get("reviewed_by") || ""),
      approved_by: String(fd.get("approved_by") || ""),
      items,
      image_paths,
    };

    setStatus("saving");

    // Handled as two explicit branches (rather than one ternary picking
    // between the two action calls) so TypeScript can narrow each result to
    // its own return type — createPurchaseRequest's success case carries an
    // `id`, updatePurchaseRequest's doesn't need one since it's already
    // known (pr.id).
    let targetId: string;
    if (isEdit) {
      const result = await updatePurchaseRequest({ id: pr!.id, ...common });
      if (!result.ok) {
        setStatus("idle");
        setError(result.error);
        return;
      }
      targetId = pr!.id;
    } else {
      const result = await createPurchaseRequest({ id: recordId, ...common });
      if (!result.ok) {
        setStatus("idle");
        setError(result.error);
        return;
      }
      targetId = result.id;
    }

    if (failedCount > 0) {
      setError(
        `Saved, but ${failedCount} image${failedCount > 1 ? "s" : ""} failed to upload — open this PR and attach again.`
      );
    }

    router.push(`/purchasing/${targetId}`);
  }

  const busy = status !== "idle";

  const formBody = (
    <form onSubmit={handleSubmit} className="space-y-4 border-t border-gray-100 p-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Department</span>
          <input
            name="request_department"
            required
            placeholder="e.g. LAB"
            defaultValue={pr?.request_department ?? ""}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Division</span>
          <input
            name="division"
            placeholder="e.g. Quality System Division"
            defaultValue={pr?.division ?? ""}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Date</span>
          <input
            name="request_date"
            type="date"
            defaultValue={pr?.request_date ?? today}
            required
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">
            Line <span className="font-normal text-gray-400">(optional)</span>
          </span>
          <input name="line" defaultValue={pr?.line ?? ""} className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">
            Job No. <span className="font-normal text-gray-400">(optional)</span>
          </span>
          <input name="job_no" defaultValue={pr?.job_no ?? ""} className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">
            Replaces PR No. <span className="font-normal text-gray-400">(optional)</span>
          </span>
          <input
            name="replaces_pr_no"
            placeholder="e.g. PR2026/003"
            defaultValue={pr?.replaces_pr_no ?? ""}
            className={inputClass}
          />
        </label>
      </div>

      <div>
        <span className="mb-2 block text-sm font-medium text-gray-700">
          Items requested <span className="font-normal text-gray-400">(add as many as needed)</span>
        </span>
        <div className="overflow-x-auto rounded-md border border-gray-200">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-2 py-2">Item code</th>
                <th className="px-2 py-2">Description</th>
                <th className="px-2 py-2">Qty</th>
                <th className="px-2 py-2">Unit</th>
                <th className="px-2 py-2">Stock left</th>
                <th className="px-2 py-2">Date needed</th>
                <th className="px-2 py-2">Remark</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((it, i) => (
                <tr key={i}>
                  <td className="px-2 py-2 w-28">
                    <input
                      className={inputClass}
                      value={it.item_code}
                      onChange={(e) => updateItem(i, "item_code", e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      className={inputClass}
                      value={it.description}
                      onChange={(e) => updateItem(i, "description", e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-2 w-20">
                    <input
                      className={inputClass}
                      type="number"
                      step="any"
                      value={it.qty}
                      onChange={(e) => updateItem(i, "qty", e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-2 w-24">
                    <input
                      className={inputClass}
                      value={it.unit}
                      onChange={(e) => updateItem(i, "unit", e.target.value)}
                    />
                  </td>

                  <td className="px-2 py-2 w-24">
                    <input
                      className={inputClass}
                      type="number"
                      step="any"
                      value={it.stock_left}
                      onChange={(e) => updateItem(i, "stock_left", e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-2 w-36">
                    <input
                      className={inputClass}
                      type="date"
                      value={it.date_needed}
                      onChange={(e) => updateItem(i, "date_needed", e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      className={inputClass}
                      placeholder="e.g. for QA microbiology test"
                      value={it.remark}
                      onChange={(e) => updateItem(i, "remark", e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          onClick={addRow}
          className="mt-2 rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
        >
          + Add item
        </button>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">Note</span>
        <textarea
          name="note"
          rows={2}
          placeholder="e.g. Compare test results across labs"
          defaultValue={pr?.note ?? ""}
          className={inputClass}
        />
      </label>

      <div>
        <span className="mb-1 block text-sm font-medium text-gray-700">
          Attach images <span className="font-normal text-gray-400">(optional, multiple allowed)</span>
        </span>

        {keepPaths.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-3">
            {keepPaths.map((path) => (
              <div key={path} className="relative h-20 w-20 overflow-hidden rounded-md border border-gray-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={publicUrlFor(path)} alt="Attachment" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeExistingImage(path)}
                  className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs text-white hover:bg-black/80"
                  aria-label="Remove image"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <input
          name="images"
          type="file"
          accept="image/*"
          multiple
          className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
        />
        <span className="mt-1 block text-xs text-gray-400">
          Images show on the detail page and are attached as extra pages after the main PR page in the exported PDF.
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Recorded by</span>
          <select name="recorded_by" defaultValue={pr?.recorded_by ?? defaultRecordedBy} className={inputClass}>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name || "-"}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Reviewed by</span>
          <select name="reviewed_by" defaultValue={pr?.reviewed_by ?? ""} className={inputClass}>
            <option value="">-</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name || "-"}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Approved by</span>
          <select name="approved_by" defaultValue={pr?.approved_by ?? ""} className={inputClass}>
            <option value="">-</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name || "-"}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          disabled={busy}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {status === "uploading"
            ? "Uploading images…"
            : status === "saving"
            ? "Saving…"
            : isEdit
            ? "Save changes"
            : "Submit Purchasing Request"}
        </button>
        <span className="text-xs text-gray-400">
          {isEdit
            ? "Status, requester, and PR No. are not changed by editing."
            : "Goes to the department head for approval, same as Requests."}
        </span>
      </div>
    </form>
  );

  if (isEdit) {
    return <div className="mt-6 rounded-lg border border-gray-200 bg-white">{formBody}</div>;
  }

  return (
    <details className="mt-6 rounded-lg border border-gray-200 bg-white">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-brand-700">
        + New Purchasing Request
      </summary>
      {formBody}
    </details>
  );
}
