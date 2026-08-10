"use client";

export type PurchaseRequestPdfHeader = {
  pr_no: string;
  request_date: string;
  request_department: string;
  division: string | null;
  line: string | null;
  job_no: string | null;
  replaces_pr_no: string | null;
  note: string | null;
};

export type PurchaseRequestPdfItem = {
  item_code: string | null;
  description: string | null;
  qty: number;
  unit: string | null;
  stock_left: number;
  date_needed: string | null;
  remark: string | null;
};

function toDMY(value: string | null) {
  if (!value) return "-";
  const [y, m, d] = value.split("-");
  return `${d}/${m}/${y}`;
}

export default function PurchaseRequestPdfButton({
  pr,
  items,
}: {
  pr: PurchaseRequestPdfHeader;
  items: PurchaseRequestPdfItem[];
}) {
  async function handleExport() {
    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const { default: sarabunRegular } = await import("@/lib/pdf-fonts/sarabun-regular");
    const { default: sarabunBold } = await import("@/lib/pdf-fonts/sarabun-bold");

  const doc = new jsPDF({ unit: "pt", format: "a4" });

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
    doc.text("Purchasing Request", pageWidth - marginX, 40, { align: "right" });
    doc.setFont("Sarabun", "bold");
    doc.setFontSize(14);
    doc.text(pr.pr_no, pageWidth - marginX, 56, { align: "right" });
    doc.setFont("Sarabun", "normal");
    doc.setFontSize(9);
    doc.setTextColor(90);
    doc.text(`Date: ${toDMY(pr.request_date)}`, pageWidth - marginX, 68, { align: "right" });

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
    kv("Department", pr.request_department, marginX);
    kv("Division", pr.division, col2);
    y += 18;
    kv("Line", pr.line, marginX);
    kv("Job No.", pr.job_no, col2);
    y += 18;
    kv("Replaces", pr.replaces_pr_no, marginX);
    y += 20;

  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    head: [["Item code", "Description", "Qty", "Unit", "Stock left", "Date needed", "Remark"]],
    body: items.map((it) => [
      it.item_code || "-",
      it.description || "-",
      String(it.qty),
      it.unit || "-",
      String(it.stock_left),
      toDMY(it.date_needed),
      it.remark || "-",
      ]),
    styles: { font: "Sarabun", fontSize: 9, cellPadding: 5 },
    headStyles: { font: "Sarabun", fillColor: [74, 124, 47], textColor: 255 },
    columnStyles: {
      2: { halign: "right" },
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
    const lines = doc.splitTextToSize(value || "-", pageWidth - marginX * 2);
    doc.text(lines, marginX, y + 13);
    y += 13 + lines.length * 13 + 8;
  };

  block("Note", pr.note);

  doc.save(`PurchaseRequest-${pr.pr_no.replace("/", "-")}.pdf`);
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
