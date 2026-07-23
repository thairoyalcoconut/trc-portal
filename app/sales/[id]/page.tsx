import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import Nav from "@/components/Nav";
import SaleOrderPdfButton from "@/components/SaleOrderPdfButton";
import { deleteSaleOrder } from "../actions";

export default async function SaleOrderDetailPage({ params }: { params: { id: string } }) {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const supabase = createClient();
  const { data: order } = await supabase
    .from("sale_orders")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!order) notFound();

  const { data: items } = await supabase
    .from("sale_order_items")
    .select("*")
    .eq("sale_order_id", params.id)
    .order("position", { ascending: true });

  const orderItems = items ?? [];
  const orderTotal = orderItems.reduce((sum, it) => sum + (Number(it.total_price) || 0), 0);
  const canDelete = profile.role === "admin" || profile.role === "manager";

  return (
    <>
      <Nav profile={profile} />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Link href="/sales" className="text-sm text-brand-600 hover:underline">
          ← Back to Sales Orders
        </Link>

        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-400">Sales Order</div>
              <h1 className="text-2xl font-semibold text-brand-700">{order.order_no}</h1>
              <div className="text-sm text-gray-500">
                Issue date: {formatDate(order.issue_date)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={`/sales/${order.id}/edit`}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Edit
              </Link>
              <SaleOrderPdfButton order={order} items={orderItems} orderTotal={orderTotal} />
            </div>
          </div>

          <dl className="mt-6 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            <Item label="Customer" value={order.customer} />
            <Item label="Brand" value={order.brand} />
            <Item label="Shipment date" value={formatDate(order.shipment_date)} />
            <Item label="Payment term" value={order.payment_term} />
            <Item label="Sales representative" value={order.sales_representative} />
          </dl>

          <div className="mt-6">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
              Product lines
            </div>
            <div className="overflow-x-auto rounded-md border border-gray-200">
              <table className="min-w-full divide-y divide-gray-100 text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Product name</th>
                    <th className="px-3 py-2">Packing</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Price/unit</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2">Spec no.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {orderItems.map((it) => (
                    <tr key={it.id}>
                      <td className="px-3 py-2 text-gray-800">{it.product_name}</td>
                      <td className="px-3 py-2 text-gray-500">{it.packing}</td>
                      <td className="px-3 py-2 text-right text-gray-500">{it.quantity}</td>
                      <td className="px-3 py-2 text-right text-gray-500">
                        {Number(it.price_per_unit).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        {Number(it.total_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2 text-gray-500">{it.product_spec_no}</td>
                    </tr>
                  ))}
                  {orderItems.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-4 text-center text-gray-400">
                        No product lines.
                      </td>
                    </tr>
                  )}
                </tbody>
                {orderItems.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-gray-200">
                      <td colSpan={4} className="px-3 py-2 text-right text-sm font-medium text-gray-700">
                        Order total
                      </td>
                      <td className="px-3 py-2 text-right text-sm font-semibold text-brand-700">
                        {orderTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          <dl className="mt-6 grid grid-cols-1 gap-y-4">
            <Item label="Product Description" value={order.product_description} />
            <Item label="Packaging Detail" value={order.packaging_detail} />
            <Item label="Remark" value={order.remark} />
            <Item label="Compiled by" value={order.compiled_by} />
          </dl>

          {canDelete && (
            <form action={deleteSaleOrder} className="mt-6 border-t border-gray-100 pt-4">
              <input type="hidden" name="id" value={order.id} />
              <button className="text-xs text-red-500 hover:underline">
                Delete this sales order
              </button>
            </form>
          )}
        </div>
      </main>
    </>
  );
}

function formatDate(value: string | null) {
  if (!value) return null;
  const [y, m, d] = value.split("-");
  return `${d}/${m}/${y}`;
}

function Item({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap text-sm text-gray-800">{value || "-"}</dd>
    </div>
  );
}
