"use client";

import { useState } from "react";
import { parseRichText, type RichParagraph } from "@/lib/memoRichText";

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

// Base size for the Details body text — matches the size used for
// "ผู้ตรวจสอบ" / "ผู้อนุมัติ" under the signature line (see the
// doc.setFontSize(9) call in the signature-footer loop below), per the
// user's request that ordinary (unstyled) body text look consistent with
// that reference point. The same 9pt baseline is used in RichTextEditor
// and MemoPrintPreview so the editor, the on-screen preview, and this PDF
// export all agree on what "default size" means.
const DETAILS_BASE_PT = 9;
const LINE_HEIGHT_FACTOR = 1.5;
const PARAGRAPH_GAP_FACTOR = 1.9;

// Converts a CSS color string (as produced by lib/memoRichText's sanitizer —
// hex, rgb()/rgba(), or occasionally a short named color) to an RGB triplet
// jsPDF's setTextColor/setDrawColor can use. Falls back to black for
// anything not confidently parseable, rather than risking bogus values.
function colorToRgb(css: string | null): [number, number, number] {
  if (!css) return [0, 0, 0];
  const v = css.trim();
  let m = v.match(/^#([0-9a-fA-F]{3})$/);
  if (m) {
    const [r, g, b] = m[1].split("").map((c) => parseInt(c + c, 16));
    return [r, g, b];
  }
  m = v.match(/^#([0-9a-fA-F]{6})/);
  if (m) {
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  m = v.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return [0, 0, 0];
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
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - marginX * 2;

  // Lays out and draws parsed rich-text paragraphs (see lib/memoRichText's
  // parseRichText) word-by-word so each run can carry its own bold/color/
  // font-size — this is what makes the exported PDF match whatever
  // formatting was applied on screen, instead of falling back to flat
  // text. Wraps at word boundaries like the previous splitTextToSize-based
  // rendering did, with a character-level fallback for a single "word"
  // wider than the page (e.g. a long unbroken run with no spaces), and
  // adds new pages automatically if the details run long.
  function drawRichParagraphs(paragraphs: RichParagraph[], startX: number, startY: number, maxWidth: number) {
    let x = startX;
    let y = startY;
    let lineMaxSize = DETAILS_BASE_PT;

  function newPage() {
    doc.addPage();
    doc.setFont("Sarabun", "bold");
    doc.setFontSize(DETAILS_BASE_PT);
    doc.setTextColor(0);
    doc.text("รายละเอียด (ต่อ)", marginX, 36);
    x = startX;
    y = 58;
    lineMaxSize = DETAILS_BASE_PT;
  }

  function advanceLine() {
    y += lineMaxSize * LINE_HEIGHT_FACTOR;
    x = startX;
    lineMaxSize = DETAILS_BASE_PT;
    if (y > pageHeight - 50) newPage();
  }

  // Re-applies font/size/color on every chunk (not just once per run)
  // because advanceLine() can trigger newPage(), which draws a bold
  // continuation header and leaves the doc's font state pointed at
  // that — without this, any word placed right after a mid-run page
  // break would silently render in the wrong style.
  function placeChunk(
    text: string,
    size: number,
    bold: boolean,
    underline: boolean,
    r: number,
    g: number,
    b: number
    ) {
    doc.setFont("Sarabun", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(r, g, b);
    const isSpace = /^\s+$/.test(text);
    const width = doc.getTextWidth(text);
    if (!isSpace && x + width > startX + maxWidth && x > startX) advanceLine();
    if (!isSpace) {
      doc.setFont("Sarabun", bold ? "bold" : "normal");
      doc.setFontSize(size);
      doc.setTextColor(r, g, b);
      doc.text(text, x, y);
      if (underline) {
        doc.setDrawColor(r, g, b);
        doc.setLineWidth(Math.max(0.5, size * 0.045));
        doc.line(x, y + size * 0.14, x + width, y + size * 0.14);
      }
    }
    x += width;
    lineMaxSize = Math.max(lineMaxSize, size);
  }

  paragraphs.forEach((para, pIndex) => {
    const isLastParagraph = pIndex === paragraphs.length - 1;
    if (para.length === 0) {
      advanceLine();
      return;
    }
    for (const run of para) {
      const size = run.fontSize || DETAILS_BASE_PT;
      doc.setFont("Sarabun", run.bold ? "bold" : "normal");
      doc.setFontSize(size);
      const [r, g, b] = colorToRgb(run.color);
      doc.setTextColor(r, g, b);

    const words = run.text.split(/(\s+)/).filter((w) => w.length > 0);
      for (const word of words) {
        const isSpace = /^\s+$/.test(word);
        if (!isSpace && doc.getTextWidth(word) > maxWidth) {
          // A single unbroken "word" wider than the whole content
        // width (e.g. a long URL, or Thai text with no spaces at
        // all) — fall back to character-level wrapping instead of
        // letting it run off the page.
        for (const ch of word) placeChunk(ch, size, run.bold, run.underline, r, g, b);
        } else {
          placeChunk(word, size, run.bold, run.underline, r, g, b);
        }
      }
    }
    if (!isLastParagraph) y += lineMaxSize * LINE_HEIGHT_FACTOR * (PARAGRAPH_GAP_FACTOR - 1);
    advanceLine();
  });

  doc.setTextColor(0);
    doc.setDrawColor(150);
    return y;
  }

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
  doc.text(doc.splitTextToSize((memo.subject || "-").replace(/\t/g, " "), fieldWidth - 12), marginX + 6, y + 16);
  doc.text(doc.splitTextToSize((memo.to_recipient || "-").replace(/\t/g, " "), fieldWidth - 12), col2 + 6, y + 16);
  y += 26 + 20;

  // รายละเอียด — rendered from the parsed rich-text runs so bold/color/
  // size/underline applied on screen carry through to the PDF.
  doc.setFont("Sarabun", "bold");
  doc.setFontSize(9);
  doc.text("รายละเอียด", marginX, y);
  y += 16;
  const paragraphs = parseRichText(memo.details || "-");
  y = drawRichParagraphs(paragraphs, marginX, y, contentWidth);
  y += 8;

  // Closing line — if Details ran onto extra pages, this (and the
  // signature footer below) land on that last page, right after it.
  doc.setFont("Sarabun", "normal");
  doc.setFontSize(10);
  doc.setTextColor(0);
  if (y + 60 > pageHeight - 140) {
    doc.addPage();
    y = 56;
  }
  doc.text("จึงเรียนมาเพื่อทราบและโปรดอนุมัติ", marginX, y);
  y += 60;

  // Signature footer — three equal columns
  const footerTop = Math.max(y, pageHeight - 140);
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
