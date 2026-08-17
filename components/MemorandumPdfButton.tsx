"use client";

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

export default function MemorandumPdfButton({ memo }: { memo: MemorandumPdfHeader }) {
  async function handleExport() {
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

    doc.save(`Memorandum-${memo.memo_no.replace("/", "-")}.pdf`);
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
