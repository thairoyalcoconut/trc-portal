"use client";

import { useState } from "react";

export type MemorandumPdfHeader = {
  memo_no: string;
  memo_date: string;
  subject: string;
  to_recipient: string | null;
  details: string;
  recorded_by_name: string | null;
  reviewed_by_name: string | null;
  approved_by_name: string | null;
};

function toDMY(value: string | null) {
  if (!value) return "-";
  const [y, m, d] = value.split("-");
  return `${y}/${m}/${d}`;
}

// Fetches an image URL and returns it as a data URL plus its jsPDF format
// string and pixel dimensions (for aspect-ratio-preserving placement).
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

export default function MemorandumPdfButton({
  memo,
  imageUrls = [],
}: {
  memo: MemorandumPdfHeader;
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
    const { default: sarabunRegular } = await import("@/lib/pdf-fonts/sarabun-regular");
    const { default: sarabunBold } = await import("@/lib/pdf-fonts/sarabun-bold");

    const doc = new jsPDF({ unit: "pt", format: "a4" });

    doc.addFileToVFS("Sarabun-Regular.ttf", sarabunRegular);
    doc.addFont("Sarabun-Regular.ttf", "Sarabun", "normal");
    doc.addFileToVFS("Sarabun-Bold.ttf", sarabunBold);
    doc.addFont("Sarabun-Bold.ttf", "Sarabun", "bold");

    const marginX = 40;
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - marginX * 2;

    // Header — company name / address (left) + memo no. (right)
    doc.setFont("Sarabun", "bold");
    doc.setFontSize(13);
    doc.text("Thai Royal Coconut Co., Ltd.", marginX, 44);

    doc.setFont("Sarabun", "normal");
    doc.setFontSize(8);
    doc.setTextColor(90);
    doc.text(
      "88 Moo 1, Tambon Tachin, Mueang Samut Sakhon, Samut Sakhon 74000, Thailand · 066-137-9999",
      marginX,
      57
    );
    doc.text("เลขประจำตัวผู้เสียภาษี 0745567003301", marginX, 68);

    doc.setTextColor(0);
    doc.setFont("Sarabun", "normal");
    doc.setFontSize(9);
    doc.text("เลขที่ / No.", pageWidth - marginX, 44, { align: "right" });
    doc.setFont("Sarabun", "bold");
    doc.setFontSize(11);
    doc.text(`${memo.memo_no} - ${toDMY(memo.memo_date)}`, pageWidth - marginX, 58, { align: "right" });

    doc.setDrawColor(160);
    doc.line(marginX, 80, pageWidth - marginX, 80);

    // Title
    doc.setTextColor(0);
    doc.setFont("Sarabun", "bold");
    doc.setFontSize(15);
    doc.text("บันทึกข้อความ (MEMORANDUM)", pageWidth / 2, 104, { align: "center" });

    let y = 132;
    const col2 = marginX + contentWidth / 2 + 10;
    const fieldWidth = contentWidth / 2 - 10;

    // เรื่อง / ถึง-เรียน — two boxed fields side by side
    doc.setFont("Sarabun", "bold");
    doc.setFontSize(9);
    doc.text("เรื่อง", marginX, y);
    doc.text("ถึง / เรียน", col2, y);
    y += 6;
    doc.setDrawColor(190);
    doc.rect(marginX, y, fieldWidth, 26);
    doc.rect(col2, y, fieldWidth, 26);
    doc.setFont("Sarabun", "normal");
    doc.setFontSize(10);
    doc.text(doc.splitTextToSize(memo.subject || "-", fieldWidth - 12), marginX + 6, y + 16);
    doc.text(doc.splitTextToSize(memo.to_recipient || "-", fieldWidth - 12), col2 + 6, y + 16);
    y += 26 + 20;

    // รายละเอียด
    doc.setFont("Sarabun", "bold");
    doc.setFontSize(9);
    doc.text("รายละเอียด", marginX, y);
    y += 16;
    doc.setFont("Sarabun", "normal");
    doc.setFontSize(10);
    const detailLines = doc.splitTextToSize(memo.details || "-", contentWidth);
    doc.text(detailLines, marginX, y);
    y += detailLines.length * 14 + 16;

    // Closing line
    doc.setFont("Sarabun", "normal");
    doc.setFontSize(10);
    doc.text("จึงเรียนมาเพื่อทราบและโปรดอนุมัติ", marginX, y);
    y += 60;

    // Signature footer — three equal columns
    const footerTop = Math.max(y, doc.internal.pageSize.getHeight() - 140);
    const colWidth = contentWidth / 3;
    const signers = [
      { label: "ผู้บันทึกข้อมูล", name: memo.recorded_by_name },
      { label: "ผู้ตรวจสอบ", name: memo.reviewed_by_name },
      { label: "ผู้อนุมัติ", name: memo.approved_by_name },
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

    // Attached images — one per page, scaled to fit within the margins
    // while preserving aspect ratio. A failed image (e.g. deleted from
    // storage, or an unsupported format) is skipped, not fatal — the rest
    // of the export still completes.
    const pageHeight = doc.internal.pageSize.getHeight();
    for (let i = 0; i < imageUrls.length; i++) {
      try {
        const { dataUrl, format, width, height } = await loadImage(imageUrls[i]);
        doc.addPage();
        doc.setFont("Sarabun", "bold");
        doc.setFontSize(10);
        doc.setTextColor(0);
        doc.text(`เอกสารแนบ ${i + 1} / ${imageUrls.length}`, marginX, 40);

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

    doc.save(`Memorandum-${memo.memo_no.replace("/", "-")}.pdf`);
  }

  return (
    <button
      onClick={handleExport}
      disabled={exporting}
      className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
    >
      {exporting ? "กำลังสร้าง PDF…" : "Export PDF"}
    </button>
  );
}
