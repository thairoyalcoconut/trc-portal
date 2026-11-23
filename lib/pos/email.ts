import { shortName } from "./products";
import type { PosExpense, ShiftSummary } from "./types";

// Sends the end-of-shift summary through a Google Apps Script web app
// running on the Gmail account maeicemahachai@gmail.com (free, no DNS setup).
// See apps-script/pos-email.gs and docs/POS-BOOTH.md for setup.
//
// Env vars (Vercel → Project → Settings → Environment Variables):
//   POS_EMAIL_WEBHOOK_URL     the Apps Script /exec URL
//   POS_EMAIL_WEBHOOK_SECRET  any long random string, same value as in the script

const fmt = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 });
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export type SummaryEmailInput = {
  eventName: string;
  staffName: string;
  businessDate: string; // YYYY-MM-DD
  openedAt: string;
  closedAt: string;
  openingFloat: number;
  countedCash: number;
  summary: ShiftSummary;
  expenses: PosExpense[];
};

const thaiDate = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  return `${dd}/${m}/${y + 543}`;
};
const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

export function buildSummaryEmail(i: SummaryEmailInput) {
  const s = i.summary;
  const diff = i.countedCash - s.expectedCash;
  const diffText = diff === 0 ? "0 (ตรง)" : `${diff > 0 ? "+" : "−"}${fmt(Math.abs(diff))} (${diff > 0 ? "เงินเกิน" : "เงินขาด"})`;
  const subject = `[POS-ออกบูท] สรุปยอดขาย ${i.eventName} — ${thaiDate(i.businessDate)}`;

  const lines = [
    `สรุปยอดขายหน้าบูท — ${i.eventName}`,
    `วันที่ ${thaiDate(i.businessDate)}  เปิด ${time(i.openedAt)}  ปิด ${time(i.closedAt)}`,
    `พนักงาน: ${i.staffName}`,
    "",
    "■ ยอดขาย",
    `  รวม ${fmt(s.totalSales)} บาท (${s.billCount} บิล / ${s.pieces} ชิ้น)`,
    `  เงินสด ${fmt(s.cashSales)} | โอน/QR ${fmt(s.transferSales)}`,
    `  ส่วนลดโปรโมชั่น ${fmt(s.discount)}`,
    "",
    "■ ตามสินค้า",
    ...s.byProduct.map((r) => `  ${shortName(r.code, r.name)}  ×${r.qty}  ${fmt(r.amount)}`),
    "",
    "■ ค่าใช้จ่าย",
    ...i.expenses.map((e) => `  ${e.item}  ${fmt(Number(e.amount))}  (${e.source === "drawer" ? "ลิ้นชัก" : "โอน/ส่วนตัว"})`),
    `  รวม ${fmt(s.expenseTotal)}`,
    "",
    "■ เงินสด",
    `  เงินทอนตั้งต้น ${fmt(i.openingFloat)}`,
    `  ควรมี ${fmt(s.expectedCash)}`,
    `  นับจริง ${fmt(i.countedCash)}`,
    `  ส่วนต่าง ${diffText}`,
  ];
  const text = lines.join("\n");

  const row = (a: string, b: string, bold = false) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#4b5563">${a}</td><td style="padding:4px 0;text-align:right;${bold ? "font-weight:700" : ""}">${b}</td></tr>`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;max-width:560px">
  <h2 style="color:#2e4e1d;margin:0 0 4px">สรุปยอดขายหน้าบูท — ${esc(i.eventName)}</h2>
  <p style="margin:0 0 16px;color:#6b7280">วันที่ ${thaiDate(i.businessDate)} · เปิด ${time(i.openedAt)} ปิด ${time(i.closedAt)} · พนักงาน ${esc(i.staffName)}</p>
  <h3 style="margin:16px 0 6px">ยอดขาย</h3><table>
  ${row("ยอดขายรวม", `${fmt(s.totalSales)} บาท`, true)}${row("จำนวน", `${s.billCount} บิล / ${s.pieces} ชิ้น`)}
  ${row("เงินสด", fmt(s.cashSales))}${row("โอน / QR", fmt(s.transferSales))}${row("ส่วนลดโปรโมชั่น", fmt(s.discount))}</table>
  <h3 style="margin:16px 0 6px">ตามสินค้า</h3><table>${s.byProduct.map((r) => row(`${esc(shortName(r.code, r.name))} ×${r.qty}`, fmt(r.amount))).join("")}</table>
  <h3 style="margin:16px 0 6px">ค่าใช้จ่าย</h3><table>${i.expenses
    .map((e) => row(`${esc(e.item)} (${e.source === "drawer" ? "ลิ้นชัก" : "โอน/ส่วนตัว"})`, fmt(Number(e.amount))))
    .join("")}${row("รวม", fmt(s.expenseTotal), true)}</table>
  <h3 style="margin:16px 0 6px">เงินสด</h3><table>
  ${row("เงินทอนตั้งต้น", fmt(i.openingFloat))}${row("ควรมี", fmt(s.expectedCash))}${row("นับจริง", fmt(i.countedCash))}
  ${row("ส่วนต่าง", diffText, true)}</table>
  <p style="margin-top:20px;color:#9ca3af;font-size:12px">ส่งอัตโนมัติจาก TRC Portal · POS-ออกบูท</p></div>`;

  return { subject, text, html };
}

export async function sendSummaryEmail(to: string[], mail: { subject: string; text: string; html: string }) {
  const url = process.env.POS_EMAIL_WEBHOOK_URL;
  const secret = process.env.POS_EMAIL_WEBHOOK_SECRET;
  if (!url || !secret) return { ok: false as const, error: "ยังไม่ได้ตั้งค่าการส่งอีเมล์ (POS_EMAIL_WEBHOOK_URL)" };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // Apps Script reads e.postData.contents
      body: JSON.stringify({ secret, to, ...mail }),
      redirect: "follow",
      cache: "no-store",
    });
    const body = await res.text();
    let parsed: { ok?: boolean; error?: string } = {};
    try {
      parsed = JSON.parse(body);
    } catch {
      /* non-JSON = Apps Script error page */
    }
    if (!res.ok || !parsed.ok) return { ok: false as const, error: parsed.error || `HTTP ${res.status}` };
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "ส่งอีเมล์ไม่สำเร็จ" };
  }
}
