"use client";

import { useState } from "react";
import { createPurchaseRequest } from "./actions";

type Item = {
  item_code: string;
  description: string;
  qty: string;
  unit: string;
  stock_left: string;
  date_needed: string;
  remark: string;
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

export default function PurchaseRequestForm({ today }: { today: string }) {
  const [items, setItems] = useState<Item[]>([emptyItem()]);

function updateItem(index: number, field: keyof Item, value: string) {
  setItems((prev) => prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)));
}

function addRow() {
  setItems((prev) => [...prev, emptyItem()]);
}

function removeRow(index: number) {
  setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
}

return (
  <details className="mt-6 rounded-lg border border-gray-200 bg-white">
  <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-brand-700">
  + New Purchasing Request
  </summary>
  <form action={createPurchaseRequest} className="space-y-4 border-t border-gray-100 p-4">
  <input type="hidden" name="items_json" value={JSON.stringify(items)} />
  
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
  <label className="block">
  <span className="mb-1 block text-sm font-medium text-gray-700">Department</span>
  <input name="request_department" required placeholder="e.g. LAB" className={inputClass} />
  </label>
  <label className="block">
  <span className="mb-1 block text-sm font-medium text-gray-700">Division</span>
  <input name="division" placeholder="e.g. Quality System Division" className={inputClass} />
  </label>
  <label className="block">
  <span className="mb-1 block text-sm font-medium text-gray-700">Date</span>
  <input name="request_date" type="date" defaultValue={today} required className={inputClass} />
  </label>
  <label className="block">
  <span className="mb-1 block text-sm font-medium text-gray-700">
  Line <span className="font-normal text-gray-400">(optional)</span>
  </span>
  <input name="line" className={inputClass} />
  </label>
  <label className="block">
  <span className="mb-1 block text-sm font-medium text-gray-700">
  Job No. <span className="font-normal text-gray-400">(optional)</span>
  </span>
  <input name="job_no" className={inputClass} />
  </label>
  <label className="block">
  <span className="mb-1 block text-sm font-medium text-gray-700">
  Replaces PR No. <span className="font-normal text-gray-400">(optional)</span>
  </span>
  <input name="replaces_pr_no" placeholder="e.g. PR2026/003" className={inputClass} />
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
    className={inputClass}
    />
  </label>
  
  <div className="flex items-center gap-3">
  <button className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
  Submit Purchasing Request
  </button>
  <span className="text-xs text-gray-400">
  Goes to the department head for approval, same as Requests.
  </span>
  </div>
  </form>
  </details>
  );
}
</details>
