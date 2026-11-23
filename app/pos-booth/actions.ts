"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { canUsePos } from "@/lib/pos/access";
import { calcBill, fullName, LOCKED_REPORT_EMAIL, PRODUCT_BY_CODE, type CartItems } from "@/lib/pos/products";
import { buildSummaryEmail, sendSummaryEmail } from "@/lib/pos/email";
import {
  summarizeShift,
  type ActionResult,
  type ExpenseSource,
  type PayMethod,
  type PosBill,
  type PosExpense,
  type PosShift,
} from "@/lib/pos/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function requireUser() {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("กรุณาเข้าสู่ระบบ");
  if (!canUsePos(profile)) throw new Error("เฉพาะฝ่าย Marketing เท่านั้น");
  return profile;
}

function fail(e: unknown): { ok: false; error: string } {
  const msg = e instanceof Error ? e.message : String(e);
  console.error("[pos-booth]", msg);
  return { ok: false, error: msg };
}

// ---------------------------------------------------------------- open
export async function openShift(input: { eventName: string; openingFloat: number }): Promise<ActionResult<PosShift>> {
  try {
    const profile = await requireUser();
    const eventName = input.eventName.trim();
    const openingFloat = Number(input.openingFloat);
    if (!eventName) throw new Error("กรุณาระบุชื่องาน Event");
    if (!Number.isFinite(openingFloat) || openingFloat < 0) throw new Error("เงินทอนตั้งต้นไม่ถูกต้อง");

    const supabase = createClient();
    // POS is a Marketing module — always file under Marketing (lets admins with no department use it too).
    const { data: dept } = await supabase.from("departments").select("id").eq("name", "Marketing").single();

    const { data, error } = await supabase
      .from("pos_shifts")
      .insert({
        department_id: dept?.id ?? profile.department_id,
        event_name: eventName,
        staff_name: profile.full_name || profile.email || "",
        opened_by: profile.id,
        opening_float: openingFloat,
      })
      .select("id, event_name, staff_name, opening_float, opened_at, business_date, status")
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("มีร้านที่เปิดค้างอยู่แล้ว — กรุณารีเฟรชหน้า");
      throw new Error(error.message);
    }
    revalidatePath("/pos-booth");
    return { ok: true, data: data as PosShift };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- pay
export async function payBill(input: {
  shiftId: string;
  billNo: number;
  items: CartItems;
  usePromo: boolean;
  paymentMethod: PayMethod;
  cashReceived: number | null;
}): Promise<ActionResult<PosBill>> {
  try {
    await requireUser();
    if (input.paymentMethod !== "cash" && input.paymentMethod !== "transfer") throw new Error("วิธีชำระเงินไม่ถูกต้อง");

    // Recompute everything from the server-side price list — never trust browser totals.
    const items: CartItems = {};
    for (const [code, q] of Object.entries(input.items)) {
      const qty = Math.floor(Number(q));
      if (!PRODUCT_BY_CODE[code]) throw new Error(`ไม่รู้จักสินค้า ${code}`);
      if (qty > 0) items[code] = qty;
    }
    const c = calcBill(items, input.usePromo);
    if (c.qty === 0) throw new Error("บิลว่าง");
    const cash = input.paymentMethod === "cash" ? Number(input.cashReceived) : null;
    if (cash !== null && !(cash >= c.total)) throw new Error("รับเงินไม่พอ");

    const lines = Object.entries(items).map(([code, quantity]) => {
      const p = PRODUCT_BY_CODE[code];
      return { product_code: code, product_name: fullName(p), unit_price: p.price, quantity };
    });

    const supabase = createClient();
    const { data, error } = await supabase.rpc("pos_create_bill", {
      p_shift_id: input.shiftId,
      p_bill_no: input.billNo,
      p_payment_method: input.paymentMethod,
      p_subtotal: c.subtotal,
      p_discount: c.discount,
      p_total: c.total,
      p_cash_received: cash,
      p_promo_applied: c.applied,
      p_promo_label: c.applied ? c.promoLabel : null,
      p_items: lines,
    });
    if (error) {
      if (/row-level security/i.test(error.message)) throw new Error("ร้านนี้ปิดไปแล้ว หรือไม่มีสิทธิ์");
      throw new Error(error.message);
    }
    const row = (data as { id: string; bill_code: string; paid_at: string }[])[0];
    return {
      ok: true,
      data: {
        id: row.id,
        bill_code: row.bill_code,
        bill_no: input.billNo,
        business_date: "",
        paid_at: row.paid_at,
        payment_method: input.paymentMethod,
        subtotal: c.subtotal,
        discount: c.discount,
        total: c.total,
        cash_received: cash,
        promo_label: c.applied ? c.promoLabel : null,
        items: lines,
      },
    };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- expenses
export async function addExpense(input: {
  shiftId: string;
  item: string;
  amount: number;
  source: ExpenseSource;
  note: string;
}): Promise<ActionResult<PosExpense>> {
  try {
    const profile = await requireUser();
    const item = input.item.trim();
    const amount = Number(input.amount);
    if (!item) throw new Error("กรุณาระบุรายการ");
    if (!(amount > 0)) throw new Error("ราคาต้องมากกว่า 0");
    const supabase = createClient();
    const { data, error } = await supabase
      .from("pos_expenses")
      .insert({
        shift_id: input.shiftId,
        item,
        amount,
        source: input.source === "other" ? "other" : "drawer",
        note: input.note.trim() || null,
        created_by: profile.id,
      })
      .select("id, item, amount, source, note, created_at")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, data: data as PosExpense };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteExpense(id: string): Promise<ActionResult<null>> {
  try {
    await requireUser();
    const supabase = createClient();
    const { error, count } = await supabase.from("pos_expenses").delete({ count: "exact" }).eq("id", id);
    if (error) throw new Error(error.message);
    if (!count) throw new Error("ลบไม่ได้ (ร้านปิดแล้ว หรือไม่มีสิทธิ์)");
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- close
export async function closeShift(input: {
  shiftId: string;
  countedCash: number;
  extraEmails: string[];
}): Promise<ActionResult<{ emailSent: boolean; emailError: string | null; recipients: string[] }>> {
  try {
    await requireUser();
    const counted = Number(input.countedCash);
    if (!Number.isFinite(counted) || counted < 0) throw new Error("กรุณากรอกเงินสดคงเหลือ (นับจริง)");
    const extras = [...new Set(input.extraEmails.map((e) => e.trim().toLowerCase()))].filter(
      (e) => EMAIL_RE.test(e) && e !== LOCKED_REPORT_EMAIL
    );
    const recipients = [LOCKED_REPORT_EMAIL, ...extras].slice(0, 10);

    const supabase = createClient();
    const [{ data: shift, error: se }, { data: bills, error: be }, { data: expenses, error: ee }] = await Promise.all([
      supabase.from("pos_shifts").select("id, event_name, staff_name, opening_float, opened_at, business_date, status").eq("id", input.shiftId).single(),
      supabase
        .from("pos_bills")
        .select("id, bill_code, bill_no, business_date, paid_at, payment_method, subtotal, discount, total, cash_received, promo_label, items:pos_bill_items(product_code, product_name, unit_price, quantity)")
        .eq("shift_id", input.shiftId),
      supabase.from("pos_expenses").select("id, item, amount, source, note, created_at").eq("shift_id", input.shiftId).order("created_at"),
    ]);
    if (se || !shift) throw new Error(se?.message || "ไม่พบรอบขายนี้");
    if (be) throw new Error(be.message);
    if (ee) throw new Error(ee.message);
    if (shift.status !== "open") throw new Error("รอบนี้ปิดไปแล้ว");

    const summary = summarizeShift(Number(shift.opening_float), (bills ?? []) as PosBill[], (expenses ?? []) as PosExpense[]);
    const closedAt = new Date().toISOString();

    const mail = buildSummaryEmail({
      eventName: shift.event_name,
      staffName: shift.staff_name,
      businessDate: shift.business_date,
      openedAt: shift.opened_at,
      closedAt,
      openingFloat: Number(shift.opening_float),
      countedCash: counted,
      summary,
      expenses: (expenses ?? []) as PosExpense[],
    });
    const sent = await sendSummaryEmail(recipients, mail);

    const { error: ue } = await supabase
      .from("pos_shifts")
      .update({
        status: "closed",
        closed_at: closedAt,
        counted_cash: counted,
        expected_cash: summary.expectedCash,
        report_emails: recipients,
        email_status: sent.ok ? "sent" : `failed: ${sent.error}`,
      })
      .eq("id", input.shiftId);
    if (ue) throw new Error(ue.message);

    revalidatePath("/pos-booth");
    revalidatePath("/pos-booth/report");
    return { ok: true, data: { emailSent: sent.ok, emailError: sent.ok ? null : sent.error, recipients } };
  } catch (e) {
    return fail(e);
  }
}
