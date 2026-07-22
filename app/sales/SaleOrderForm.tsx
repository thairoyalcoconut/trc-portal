"use client";

import { useMemo, useState } from "react";
import { createSaleOrder } from "./actions";

type Item = {
  product_name: string;
  packing: string;
  quantity: string;
  price_per_unit: string;
  product_spec_no: string;
};

const emptyItem = (): Item => ({
  product_name: "",
  packing: "",
  quantity: "",
  price_per_unit: "",
  product_spec_no: "",
});

const inputClass =
  "w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

export default function SaleOrderForm({ today }: { today: string }) {
  const [items, setItems] = useState<Item[]>([emptyItem()]);

  const total = useMemo(() => {
    return items.reduce((sum, it) => {
      const q = parseFloat(it.quantity) || 0;
      const p = parseFloat(it.price_per_unit) || 0;
      return sum + q * p;
    }, 0);
  }, [items]);

  function updateItem(index: number, field: keyof Item, value: string) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)));
  }

  function addRow() {
    setItems((prev) => [...prev, emptyItem()]);
  }

  function removeRow(index: number) {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  const lineTotal = (it: Item) => {
    const q = parseFloat(it.quantity) || 0;
    const p = parseFloat(it.price_per_unit) || 0;
    return (q * p).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <details className="mt-6 rounded-lg border border-gray-200 bg-white">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-brand-700">
        + New Sales Order
      </summary>
      <form action={createSaleOrder} className="space-y-4 border-t border-gray-100 p-4">
        <input type="hidden" name="items_json" value={JSON.stringify(items)} />

        <div className="flex justify-end">
          <label className="block w-48">
            <span className="mb-1 block text-sm font-medium text-gray-700">Issue date</span>
            <input
              name="issue_date"
              type="date"
              defaultValue={today}
              required
              className={inputClass}
            />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Customer</span>
            <input name="customer" required className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Brand</span>
            <input name="brand" className={inputClass} />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Shipment date</span>
            <input name="shipment_date" type="date" className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Payment term</span>
            <input name="payment_term" placeholder="e.g. 30 days after B/L" className={inputClass} />
          </label>
        </div>

        <label className="block sm:w-1/2 sm:pr-2">
          <span className="mb-1 block text-sm font-medium text-gray-700">Sales representative</span>
          <input name="sales_representative" className={inputClass} />
        </label>

        <div>
          <span className="mb-2 block text-sm font-medium text-gray-700">
            Product lines <span className="font-normal text-gray-400">(add as many as needed)</span>
          </span>
          <div className="overflow-x-auto rounded-md border border-gray-200">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-2 py-2">Product name</th>
                  <th className="px-2 py-2">Packing</th>
                  <th className="px-2 py-2">Qty</th>
                  <th className="px-2 py-2">Price/unit</th>
                  <th className="px-2 py-2 text-right">Total</th>
                  <th className="px-2 py-2">Spec no.</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((it, i) => (
                  <tr key={i}>
                    <td className="px-2 py-2">
                      <input
                        className={inputClass}
                        value={it.product_name}
                        onChange={(e) => updateItem(i, "product_name", e.target.value)}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className={inputClass}
                        value={it.packing}
                        onChange={(e) => updateItem(i, "packing", e.target.value)}
                      />
                    </td>
                    <td className="px-2 py-2 w-24">
                      <input
                        className={inputClass}
                        type="number"
                        step="any"
                        value={it.quantity}
                        onChange={(e) => updateItem(i, "quantity", e.target.value)}
                      />
                    </td>
                    <td className="px-2 py-2 w-28">
                      <input
                        className={inputClass}
                        type="number"
                        step="any"
                        value={it.price_per_unit}
                        onChange={(e) => updateItem(i, "price_per_unit", e.target.value)}
                      />
                    </td>
                    <td className="px-2 py-2 w-28 text-right text-gray-600">{lineTotal(it)}</td>
                    <td className="px-2 py-2">
                      <input
                        className={inputClass}
                        value={it.product_spec_no}
                        onChange={(e) => updateItem(i, "product_spec_no", e.target.value)}
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
          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={addRow}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
            >
              + Add product line
            </button>
            <div className="text-sm text-gray-700">
              Order total:{" "}
              <span className="font-semibold text-brand-700">
                {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Product description</span>
          <textarea name="product_description" rows={2} className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Packaging detail</span>
          <textarea name="packaging_detail" rows={2} className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Remark</span>
          <textarea name="remark" rows={2} className={inputClass} />
        </label>
        <label className="block sm:w-1/2 sm:pr-2">
          <span className="mb-1 block text-sm font-medium text-gray-700">Compiled by</span>
          <input name="compiled_by" className={inputClass} />
        </label>

        <button className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          Save Sales Order
        </button>
      </form>
    </details>
  );
}
