"use client";

import { useState } from "react";

// Fetches an image URL and returns it as a data URL plus its jsPDF format
// string and pixel dimensions (for aspect-ratio-preserving placement).
// Same helper as components/MemorandumPdfButton.tsx.
async function loadImage(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}`);
  const blob = await res.blob();
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  const { width, height } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Failed to decode image"));
    img.src = dataUrl;
  });
  const format = blob.type.includes("png") ? "PNG" : blob.type.includes("gif") ? "GIF" : "JPEG";
  return { dataUrl, format, width, height };
}

export type PurchaseRequestPdfHeader = {
  pr_no: string;
  request_date: string;
  request_department: string;
  division: string | null;
  line: string | null;
  job_no: string | null;
  replaces_pr_no: string | null;
  note: string | null;
  recorded_by_name: string | null;
  reviewed_by_name: string | null;
  approved_by_name: string | null;
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
  imageUrls = [],
}: {
  pr: PurchaseRequestPdfHeader;
  items: PurchaseRequestPdfItem[];
  imageUrls?: string[];
}) {
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      await buildAndSavePdf();
    } finally {
      setExporting(false);
    }
  }

  async function buildAndSavePdf() {
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
    const pageHeight = doc.internal.pageSize.getHeight();
    const contentWidth = pageWidth - marginX * 2;

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
    const lines = doc.splitTextToSize((value || "-").replace(/\t/g, " "), pageWidth - marginX * 2);
    doc.text(lines, marginX, y + 13);
    y += 13 + lines.length * 13 + 8;
  };

  block("Note", pr.note);

  // Signature footer — three equal columns, same layout as the Memorandum
  // PDF export (see components/MemorandumPdfButton.tsx), but with English
  // labels to match the rest of this document's language.
  y += 30;
  if (y + 60 > pageHeight - 40) {
    doc.addPage();
    y = 56;
  }
  const footerTop = Math.max(y, pageHeight - 110);
  const colWidth = contentWidth / 3;
  const signers = [
    { label: "Recorded by", name: pr.recorded_by_name },
    { label: "Reviewed by", name: pr.reviewed_by_name },
    { label: "Approved by", name: pr.approved_by_name },
  ];
  signers.forEach((s, i) => {
    const x = marginX + colWidth * i;
    const center = x + colWidth / 2;
    doc.setDrawColor(150);
    doc.line(x + 20, footerTop, x + colWidth - 20, footerTop);
    doc.setFont("Sarabun", "bold");
    doc.setFontSize(10);
    doc.text(s.name || "-", center, footerTop + 16, { align: "center" });
    doc.setFont("Sarabun", "normal");
    doc.setFontSize(9);
    doc.setTextColor(90);
    doc.text(s.label, center, footerTop + 30, { align: "center" });
    doc.setTextColor(0);
  });

  // Attached images — each on its own page, after the main PR page above,
  // scaled to fit within the margins while preserving aspect ratio. Never
  // touches the main page's layout. A failed image (e.g. deleted from
  // storage, or an unsupported format) is skipped, not fatal — the rest of
  // the export still completes. Same approach as
  // components/MemorandumPdfButton.tsx.
  for (let i = 0; i < imageUrls.length; i++) {
    try {
      const { dataUrl, format, width, height } = await loadImage(imageUrls[i]);
      doc.addPage();
      doc.setFont("Sarabun", "bold");
      doc.setFontSize(10);
      doc.setTextColor(0);
      doc.text(`Attachment ${i + 1} / ${imageUrls.length}`, marginX, 40);

      const maxW = contentWidth;
      const maxH = pageHeight - 90;
      const aspect = width / height;
      let w = maxW;
      let h = w / aspect;
      if (h > maxH) {
        h = maxH;
        w = h * aspect;
      }
      const x = marginX + (maxW - w) / 2;
      doc.addImage(dataUrl, format, x, 56, w, h);
    } catch (err) {
      console.error("Skipping attachment in PDF export:", err);
    }
  }

  doc.save(`PurchaseRequest-${pr.pr_no.replace("/", "-")}.pdf`);
  }


return (
  <button
    onClick={handleExport}
    disabled={exporting}
    className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
    >
  {exporting ? "Generating PDF…" : "Export PDF"}
  </button>
  );
}
