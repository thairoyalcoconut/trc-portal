import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import Nav from "@/components/Nav";
import SaleOrderForm from "../../SaleOrderForm";

export default async function EditSaleOrderPage({ params }: { params: { id: string } }) {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const supabase = createClient();
  const { data: order } = await supabase.from("sale_orders").select("*").eq("id", params.id).single();
  if (!order) notFound();

  const { data: items } = await supabase
    .from("sale_order_items")
    .select("*")
    .eq("sale_order_id", params.id)
    .order("position", { ascending: true });

  const formItems = (items ?? []).map((it) => ({
    product_name: it.product_name ?? "",
    packing: it.packing ?? "",
    quantity: String(it.quantity ?? ""),
    price_per_unit: String(it.price_per_unit ?? ""),
    product_spec_no: it.product_spec_no ?? "",
  }));

  return (
    <>
      <Nav profile={profile} />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Link href={`/sales/${order.id}`} className="text-sm text-brand-600 hover:underline">
          ← Back to Sales Order {order.order_no}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-brand-700">Edit Sales Order {order.order_no}</h1>

        <SaleOrderForm
          today={new Date().toISOString().slice(0, 10)}
          order={{
            id: order.id,
            issue_date: order.issue_date,
            customer: order.customer,
            brand: order.brand,
            shipment_date: order.shipment_date,
            payment_term: order.payment_term,
            sales_representative: order.sales_representative,
            product_description: order.product_description,
            packaging_detail: order.packaging_detail,
            remark: order.remark,
            compiled_by: order.compiled_by,
          }}
          items={formItems}
        />
      </main>
    </>
  );
}
