"use client";

export type SaleOrderPdfHeader = {
  order_no: string;
  issue_date: string;
  customer: string | null;
  brand: string | null;
  shipment_date: string | null;
  payment_term: string | null;
  sales_representative: string | null;
  product_description: string | null;
  packaging_detail: string | null;
  remark: string | null;
  compiled_by: string | null;
};

export type SaleOrderPdfItem = {
  product_name: string | null;
  packing: string | null;
  quantity: number;
  price_per_unit: number;
  total_price: number;
  product_spec_no: string | null;
};

function toDMY(value: string | null) {
  if (!value) return "-";
  const [y, m, d] = value.split("-");
  return `${d}/${m}/${y}`;
}

const money = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function SaleOrderPdfButton({
  order,
  items,
  orderTotal,
}: {
  order: SaleOrderPdfHeader;
  items: SaleOrderPdfItem[];
  orderTotal: number;
}) {
  async function handleExport() {
    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const { default: sarabunRegular } = await import("@/lib/pdf-fonts/sarabun-regular");
    const { default: sarabunBold } = await import("@/lib/pdf-fonts/sarabun-bold");

    const doc = new jsPDF({ unit: "pt", format: "a4" });

    // Register a Thai-capable font — jsPDF's built-in fonts (helvetica etc.)
    // only cover Latin characters, so Thai text renders as garbage without this.
    doc.addFileToVFS("Sarabun-Regular.ttf", sarabunRegular);
    doc.addFont("Sarabun-Regular.ttf", "Sarabun", "normal");
    doc.addFileToVFS("Sarabun-Bold.ttf", sarabunBold);
    doc.addFont("Sarabun-Bold.ttf", "Sarabun", "bold");

    const marginX = 40;
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFont("Sarabun", "bold");
    doc.setFontSize(14);
    doc.text("Thai Royal Coconut Co., Ltd. (Head Office)", marginX, 44);

    doc.setFont("Sarabun", "normal");
    doc.setFontSize(9);
    doc.setTextColor(90);
    doc.text(
      "88 Moo 1, Tha Chin Subdistrict, Mueang Samut Sakhon District, Samut Sakhon Province 74000, Thailand",
      marginX,
      58
    );

    doc.setTextColor(0);
    doc.setFont("Sarabun", "normal");
    doc.setFontSize(11);
    doc.text("Sales Order", pageWidth - marginX, 40, { align: "right" });
    doc.setFont("Sarabun", "bold");
    doc.setFontSize(14);
    doc.text(order.order_no, pageWidth - marginX, 56, { align: "right" });
    doc.setFont("Sarabun", "normal");
    doc.setFontSize(9);
    doc.setTextColor(90);
    doc.text(`Issue date: ${toDMY(order.issue_date)}`, pageWidth - marginX, 68, { align: "right" });

    doc.setDrawColor(210);
    doc.line(marginX, 78, pageWidth - marginX, 78);

    doc.setTextColor(0);
    doc.setFontSize(10);
    let y = 96;

    const kv = (label: string, value: string | null, x: number) => {
      doc.setFont("Sarabun", "bold");
      doc.text(label, x, y);
      doc.setFont("Sarabun", "normal");
      doc.text(value || "-", x + 90, y);
    };

    const col2 = pageWidth / 2;
    kv("Customer", order.customer, marginX);
    kv("Brand", order.brand, col2);
    y += 18;
    kv("Shipment date", toDMY(order.shipment_date), marginX);
    kv("Payment term", order.payment_term, col2);
    y += 18;
    kv("Sales rep.", order.sales_representative, marginX);
    y += 20;

    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [["Product name", "Packing", "Qty", "Price/unit", "Total", "Spec no."]],
      body: items.map((it) => [
        it.product_name || "-",
        it.packing || "-",
        String(it.quantity),
        money(it.price_per_unit),
        money(it.total_price),
        it.product_spec_no || "-",
      ]),
      foot: [["", "", "", "Total", money(orderTotal), ""]],
      styles: { font: "Sarabun", fontSize: 9, cellPadding: 5 },
      headStyles: { font: "Sarabun", fillColor: [74, 124, 47], textColor: 255 },
      footStyles: { font: "Sarabun", fillColor: [240, 240, 240], textColor: 20, fontStyle: "bold" },
      columnStyles: {
        2: { halign: "right" },
        3: { halign: "right" },
        4: { halign: "right" },
      },
    });

    // @ts-expect-error jspdf-autotable augments doc with lastAutoTable at runtime
    y = (doc.lastAutoTable?.finalY ?? y) + 20;

    const block = (label: string, value: string | null) => {
      doc.setFont("Sarabun", "bold");
      doc.setFontSize(9);
      doc.text(label.toUpperCase(), marginX, y);
      doc.setFont("Sarabun", "normal");
      doc.setFontSize(10);
      const lines = doc.splitTextToSize((value || "-").replace(/\t/g, " "), pageWidth - marginX * 2);
      doc.text(lines, marginX, y + 13);
      y += 13 + lines.length * 13 + 8;
    };

    block("Product Description", order.product_description);
    block("Packaging Detail", order.packaging_detail);
    block("Remark", order.remark);

    doc.setDrawColor(210);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 20;
    doc.setFontSize(9);
    doc.setTextColor(90);
    doc.text(`Compiled by: ${order.compiled_by || "-"}`, marginX, y);

    doc.save(`SalesOrder-${order.order_no.replace("/", "-")}.pdf`);
  }

  return (
    <button
      onClick={handleExport}
      className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
    >
      Export PDF
    </button>
  );
}
