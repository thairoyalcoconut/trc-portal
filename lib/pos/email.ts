import { shortName } from "./products";
import type { PosBill, PosExpense, ShiftSummary } from "./types";

// Sends the end-of-shift summary through a Google Apps Script web app
// running on the Gmail account maeicemahachai@gmail.com (free, no DNS setup).
// See apps-script/pos-email.gs and docs/POS-BOOTH.md for setup.
//
// Env vars (Vercel → Project → Settings → Environment Variables):
//   POS_EMAIL_WEBHOOK_URL     the Apps Script /exec URL
//   POS_EMAIL_WEBHOOK_SECRET  any long random string, same value as in the script

const fmt = (n: number) => Number(n || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });
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
  bills: Pick<PosBill, "bill_code" | "paid_at" | "payment_method" | "discount" | "total" | "items">[];
};

const thaiDate = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  return `${dd}/${m}/${y + 543}`;
};
const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
const srcLabel = (s: string) => (s === "drawer" ? "ลิ้นชัก" : "โอน/ส่วนตัว");
const payLabel = (m: string) => (m === "cash" ? "เงินสด" : "โอน/QR");

export function buildSummaryEmail(i: SummaryEmailInput) {
  const s = i.summary;
  const diff = i.countedCash - s.expectedCash;
  const diffWord = diff === 0 ? "เงินตรง" : diff > 0 ? "เงินเกิน" : "เงินขาด";
  const diffNum = diff === 0 ? "0" : `${diff > 0 ? "+" : "−"}${fmt(Math.abs(diff))}`;
  const subject = `[POS-ออกบูท] สรุปยอดขาย ${i.eventName} — ${thaiDate(i.businessDate)}`;
  const bills = [...i.bills].sort((a, b) => a.paid_at.localeCompare(b.paid_at));

  // ---------- plain-text version (for mail apps that don't show HTML) ----------
  const text = [
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
    ...i.expenses.map((e) => `  ${e.item}  ${fmt(Number(e.amount))}  (${srcLabel(e.source)})`),
    `  รวม ${fmt(s.expenseTotal)}`,
    "",
    "■ เงินสด",
    `  เงินทอนตั้งต้น ${fmt(i.openingFloat)}`,
    `  ควรมี ${fmt(s.expectedCash)}`,
    `  นับจริง ${fmt(i.countedCash)}`,
    `  ส่วนต่าง ${diffNum} (${diffWord})`,
    "",
    "■ รายการบิล",
    ...bills.map((b) => `  ${b.bill_code}  ${time(b.paid_at)}  ${payLabel(b.payment_method)}  ${fmt(Number(b.total))}`),
  ].join("\n");

  // ---------- HTML version (inline styles only — email clients strip <style>) ----------
  const F = "font-family:Arial,Helvetica,sans-serif;";
  const tdL = `${F}padding:8px 12px;border-top:1px solid #e5e7eb;color:#374151;font-size:14px;`;
  const tdR = `${tdL}text-align:right;white-space:nowrap;`;
  const th = `${F}padding:8px 12px;background:#f3f4f6;color:#6b7280;font-size:12px;font-weight:bold;text-align:left;`;
  const thR = `${th}text-align:right;`;
  const table = (head: string, body: string, foot = "") =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb;margin:0 0 20px">${head}${body}${foot}</table>`;
  const section = (title: string) => `<h3 style="${F}font-size:15px;color:#111827;margin:0 0 8px">${title}</h3>`;
  const totalRow = (cells: string[], span: number) =>
    `<tr><td colspan="${span}" style="${tdL}font-weight:bold;background:#f9fafb">${cells[0]}</td><td style="${tdR}font-weight:bold;background:#f9fafb">${cells[1]}</td></tr>`;
  const kpi = (label: string, value: string, sub: string, color = "#2e4e1d") =>
    `<td width="33%" style="${F}padding:12px;border:1px solid #e5e7eb;vertical-align:top"><div style="font-size:12px;color:#6b7280">${label}</div><div style="font-size:22px;font-weight:bold;color:${color};margin:2px 0">${value}</div><div style="font-size:12px;color:#6b7280">${sub}</div></td>`;
  const diffBg = diff === 0 ? "#f0fdf4" : "#fef2f2";
  const diffFg = diff === 0 ? "#15803d" : "#b91c1c";

  const html = `<div style="${F}max-width:600px;color:#1f2937">
  <h2 style="${F}color:#2e4e1d;font-size:20px;margin:0 0 4px">สรุปยอดขายหน้าบูท — ${esc(i.eventName)}</h2>
  <p style="${F}margin:0 0 16px;color:#6b7280;font-size:13px">วันที่ ${thaiDate(i.businessDate)} · เปิด ${time(i.openedAt)} – ปิด ${time(i.closedAt)} · พนักงาน ${esc(i.staffName)}</p>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 12px"><tr>
    ${kpi("ยอดขายรวม", `฿${fmt(s.totalSales)}`, `${s.billCount} บิล · ${s.pieces} ชิ้น`)}
    ${kpi("เงินสด", `฿${fmt(s.cashSales)}`, s.totalSales ? `${Math.round((s.cashSales / s.totalSales) * 100)}% ของยอดขาย` : "-")}
    ${kpi("โอน / QR", `฿${fmt(s.transferSales)}`, s.totalSales ? `${Math.round((s.transferSales / s.totalSales) * 100)}% ของยอดขาย` : "-")}
  </tr></table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 24px"><tr>
    <td style="${F}padding:12px 14px;background:${diffBg};color:${diffFg};font-size:15px;font-weight:bold">เงินสดนับจริง ฿${fmt(i.countedCash)} · ${diffWord}</td>
    <td style="${F}padding:12px 14px;background:${diffBg};color:${diffFg};font-size:15px;font-weight:bold;text-align:right;white-space:nowrap">${diffNum} บาท</td>
  </tr></table>

  ${section("ตรวจนับเงินสด")}
  ${table(
    "",
    [
      ["เงินทอนตั้งต้น", fmt(i.openingFloat)],
      ["+ ขายเงินสด", fmt(s.cashSales)],
      ["− ค่าใช้จ่ายจากลิ้นชัก", fmt(s.expenseDrawer)],
      ["= เงินสดที่ควรมี", fmt(s.expectedCash)],
      ["เงินสดนับจริง", fmt(i.countedCash)],
    ]
      .map(([a, b], k) => `<tr><td style="${tdL}${k === 3 ? "font-weight:bold;" : ""}">${a}</td><td style="${tdR}${k === 3 ? "font-weight:bold;" : ""}">${b}</td></tr>`)
      .join("")
  )}

  ${section("ยอดขายตามสินค้า")}
  ${table(
    `<tr><th style="${th}">สินค้า</th><th style="${thR}">ชิ้น</th><th style="${thR}">บาท</th></tr>`,
    s.byProduct.map((r) => `<tr><td style="${tdL}">${esc(shortName(r.code, r.name))}</td><td style="${tdR}">${r.qty}</td><td style="${tdR}">${fmt(r.amount)}</td></tr>`).join("") +
      (s.discount ? `<tr><td colspan="2" style="${tdL}color:#b45309">ส่วนลดโปรโมชั่น</td><td style="${tdR}color:#b45309">−${fmt(s.discount)}</td></tr>` : ""),
    `<tr><td style="${tdL}font-weight:bold;background:#f9fafb">รวม</td><td style="${tdR}font-weight:bold;background:#f9fafb">${s.pieces}</td><td style="${tdR}font-weight:bold;background:#f9fafb">${fmt(s.totalSales)}</td></tr>`
  )}

  ${section("ค่าใช้จ่าย")}
  ${
    i.expenses.length
      ? table(
          `<tr><th style="${th}">รายการ</th><th style="${th}">จ่ายจาก</th><th style="${thR}">บาท</th></tr>`,
          i.expenses.map((e) => `<tr><td style="${tdL}">${esc(e.item)}${e.note ? `<div style="font-size:12px;color:#9ca3af">${esc(e.note)}</div>` : ""}</td><td style="${tdL}">${srcLabel(e.source)}</td><td style="${tdR}">${fmt(Number(e.amount))}</td></tr>`).join(""),
          totalRow(["รวม", fmt(s.expenseTotal)], 2)
        )
      : `<p style="${F}color:#9ca3af;font-size:14px;margin:0 0 20px">ไม่มีค่าใช้จ่าย</p>`
  }

  ${section(`รายการบิล (${bills.length})`)}
  ${
    bills.length
      ? table(
          `<tr><th style="${th}">เลขบิล</th><th style="${th}">เวลา</th><th style="${th}">รายการ</th><th style="${th}">ชำระ</th><th style="${thR}">ยอด</th></tr>`,
          bills
            .map(
              (b) =>
                `<tr><td style="${tdL}white-space:nowrap">${b.bill_code}</td><td style="${tdL}">${time(b.paid_at)}</td><td style="${tdL}font-size:13px;color:#6b7280">${b.items
                  .map((x) => `${esc(shortName(x.product_code, x.product_name))} ×${x.quantity}`)
                  .join(", ")}${Number(b.discount) ? ` <span style="color:#b45309">(ลด ${fmt(Number(b.discount))})</span>` : ""}</td><td style="${tdL}white-space:nowrap">${payLabel(b.payment_method)}</td><td style="${tdR}">${fmt(Number(b.total))}</td></tr>`
            )
            .join(""),
          totalRow(["รวม", fmt(s.totalSales)], 4)
        )
      : `<p style="${F}color:#9ca3af;font-size:14px;margin:0 0 20px">ไม่มีบิล</p>`
  }
  <p style="${F}margin-top:8px;color:#9ca3af;font-size:12px">ส่งอัตโนมัติจาก TRC Portal · POS-ออกบูท</p></div>`;

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
