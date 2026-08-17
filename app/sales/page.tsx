import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import Nav from "@/components/Nav";
import NoDepartment from "@/components/NoDepartment";
import SaleOrderForm from "./SaleOrderForm";

export default async function SalesPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  if (profile.departments.length === 0 && profile.role !== "admin") {
    return (
      <>
        <Nav profile={profile} />
        <NoDepartment />
      </>
    );
  }

  const supabase = createClient();
  const { data: orders } = await supabase
    .from("sale_orders")
    .select("id, order_no, issue_date, customer, sales_representative")
    .order("created_at", { ascending: false });

  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <Nav profile={profile} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-xl font-semibold text-gray-800">Sales Orders</h1>
        <p className="mt-1 text-sm text-gray-500">
          Order No. is generated automatically (YYYY/001) — no need to fill it in.
        </p>

        <SaleOrderForm today={today} />

        <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2">Order No.</th>
                <th className="px-4 py-2">Issue Date</th>
                <th className="px-4 py-2">Customer</th>
                <th className="px-4 py-2">Sales Representative</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(orders ?? []).map((o) => (
                <tr key={o.id}>
                  <td className="px-4 py-2 font-medium text-brand-700">
                    <Link href={`/sales/${o.id}`} className="hover:underline">
                      {o.order_no}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-gray-500">{o.issue_date}</td>
                  <td className="px-4 py-2 text-gray-700">{o.customer}</td>
                  <td className="px-4 py-2 text-gray-500">{o.sales_representative}</td>
                </tr>
              ))}
              {(orders ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                    No sales orders yet.
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
