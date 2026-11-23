import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { canUsePos } from "@/lib/pos/access";
import { PRODUCTS, PRODUCT_BY_CODE, shortName } from "@/lib/pos/products";
import Nav from "@/components/Nav";
import NoDepartment from "@/components/NoDepartment";
import PosHeader from "../PosHeader";

export const dynamic = "force-dynamic";

type SP = { from?: string; to?: string; event?: string; q?: string; pay?: string; page?: string; sort?: string };

type BillRow = {
  id: string;
  bill_code: string;
  business_date: string;
  paid_at: string;
  payment_method: "cash" | "transfer";
  discount: number;
  total: number;
  shift: { event_name: string; staff_name: string } | null;
  items: { product_code: string; product_name: string; unit_price: number; quantity: number }[];
};

const PER_PAGE = 20;
const fmt = (n: number) => Number(n || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function bangkokToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }); // YYYY-MM-DD
}
function addDays(d: string, n: number) {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}
const thDate = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  return `${dd}/${m}/${(y + 543) % 100}`;
};
const hm = (iso: string) => new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

export default async function PosReportPage({ searchParams }: { searchParams: SP }) {
  const profile = await getCurrentProfile();
  if (!profile) return null;
  if (!canUsePos(profile)) {
    return (
      <>
        <Nav profile={profile} />
        <NoDepartment />
      </>
    );
  }

  // ---------- filters ----------
  const today = bangkokToday();
  const monthStart = today.slice(0, 8) + "01";
  const all = searchParams.from === "all";
  const from = all ? "" : DATE_RE.test(searchParams.from ?? "") ? searchParams.from! : monthStart;
  const to = all ? "" : DATE_RE.test(searchParams.to ?? "") ? searchParams.to! : today;
  const event = searchParams.event ?? "";
  const q = (searchParams.q ?? "").trim();
  const pay = searchParams.pay === "cash" || searchParams.pay === "transfer" ? searchParams.pay : "";
  const sort = searchParams.sort === "amount" ? "amount" : "qty";
  const quick = all ? "all" : from === today && to === today ? "today" : from === addDays(today, -6) && to === today ? "7d" : from === monthStart && to === today ? "month" : "";

  const href = (over: Partial<Record<keyof SP, string>>) => {
    const p = new URLSearchParams();
    const merged: Record<string, string> = { from: all ? "all" : from, to, event, q, pay, sort, ...over };
    for (const [k, v] of Object.entries(merged)) if (v && !(k === "to" && merged.from === "all")) p.set(k, v);
    return `/pos-booth/report?${p.toString()}`;
  };

  // ---------- data (paged past Supabase's 1000-row limit) ----------
  const supabase = createClient();
  const bills: BillRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    let query = supabase
      .from("pos_bills")
      .select(
        "id, bill_code, business_date, paid_at, payment_method, discount, total, shift:pos_shifts(event_name, staff_name), items:pos_bill_items(product_code, product_name, unit_price, quantity)"
      )
      .order("paid_at", { ascending: false })
      .range(offset, offset + 999);
    if (from) query = query.gte("business_date", from);
    if (to) query = query.lte("business_date", to);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    bills.push(...((data ?? []) as unknown as BillRow[]));
    if (!data || data.length < 1000) break;
  }
  const { data: shiftNames } = await supabase.from("pos_shifts").select("event_name").order("opened_at", { ascending: false }).limit(500);
  const events = [...new Set((shiftNames ?? []).map((s) => s.event_name))];

  const rows = event ? bills.filter((b) => b.shift?.event_name === event) : bills;

  // ---------- totals ----------
  const cash = rows.filter((b) => b.payment_method === "cash").reduce((a, b) => a + Number(b.total), 0);
  const transfer = rows.filter((b) => b.payment_method !== "cash").reduce((a, b) => a + Number(b.total), 0);
  const total = cash + transfer;
  const discount = rows.reduce((a, b) => a + Number(b.discount), 0);
  const pct = (v: number) => (total ? Math.round((v / total) * 100) : 0);

  // ---------- best sellers ----------
  const agg = new Map<string, { code: string; name: string; qty: number; amount: number }>();
  for (const p of PRODUCTS) agg.set(p.code, { code: p.code, name: p.code, qty: 0, amount: 0 });
  for (const b of rows)
    for (const it of b.items) {
      const r = agg.get(it.product_code) ?? { code: it.product_code, name: it.product_name, qty: 0, amount: 0 };
      r.qty += Number(it.quantity);
      r.amount += Number(it.unit_price) * Number(it.quantity);
      agg.set(it.product_code, r);
    }
  const best = [...agg.values()].sort((a, b) => (sort === "qty" ? b.qty - a.qty || b.amount - a.amount : b.amount - a.amount));
  const pieces = best.reduce((a, r) => a + r.qty, 0);
  const max = Math.max(1, ...best.map((r) => (sort === "qty" ? r.qty : r.amount)));

  // ---------- by event ----------
  const byEvent = new Map<string, { days: Set<string>; n: number; t: number }>();
  for (const b of rows) {
    const k = b.shift?.event_name ?? "-";
    const r = byEvent.get(k) ?? { days: new Set(), n: 0, t: 0 };
    r.days.add(b.business_date);
    r.n++;
    r.t += Number(b.total);
    byEvent.set(k, r);
  }

  // ---------- bill list ----------
  const ql = q.toLowerCase();
  const list = rows.filter(
    (b) =>
      (!pay || b.payment_method === pay) &&
      (!ql || `${b.bill_code} ${b.shift?.event_name ?? ""} ${b.shift?.staff_name ?? ""}`.toLowerCase().includes(ql))
  );
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  const page = Math.min(Math.max(1, Number(searchParams.page) || 1), pages);
  const pageRows = list.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const listTotal = list.reduce((a, b) => a + Number(b.total), 0);

  const card = "rounded-lg border border-gray-200 bg-white";
  const label = "flex flex-col gap-1 text-xs font-medium uppercase text-gray-500";
  const input = "rounded-md border border-gray-300 px-3 py-2 text-sm normal-case text-gray-800 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";
  const chip = (on: boolean) =>
    `rounded-md border px-3 py-2 text-sm font-medium ${on ? "border-brand-500 bg-brand-50 text-brand-700" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"}`;

  return (
    <>
      <Nav profile={profile} />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <PosHeader active="report" />

        {/* filters */}
        <form method="get" action="/pos-booth/report" className={`${card} mb-5 flex flex-wrap items-end gap-3 p-4`}>
          <label className={label}>
            จากวันที่
            <input type="date" name="from" defaultValue={from} className={input} />
          </label>
          <label className={label}>
            ถึงวันที่
            <input type="date" name="to" defaultValue={to} className={input} />
          </label>
          <label className={`${label} min-w-[200px] flex-1`}>
            งาน Event
            <select name="event" defaultValue={event} className={input}>
              <option value="">ทุกงาน</option>
              {events.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </label>
          <input type="hidden" name="sort" value={sort} />
          <button className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">แสดง</button>
          <div className="flex flex-wrap gap-1.5">
            <Link prefetch={false} className={chip(quick === "today")} href={href({ from: today, to: today, page: "" })}>
              วันนี้
            </Link>
            <Link prefetch={false} className={chip(quick === "7d")} href={href({ from: addDays(today, -6), to: today, page: "" })}>
              7 วันล่าสุด
            </Link>
            <Link prefetch={false} className={chip(quick === "month")} href={href({ from: monthStart, to: today, page: "" })}>
              เดือนนี้
            </Link>
            <Link prefetch={false} className={chip(quick === "all")} href={href({ from: "all", to: "", page: "" })}>
              ทั้งหมด
            </Link>
          </div>
        </form>

        {/* totals */}
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="ยอดขายรวม" value={total} sub={`${rows.length} บิล · ${fmt(pieces)} ชิ้น`} />
          <Kpi label="เงินสด" value={cash} sub={`${pct(cash)}% ของยอดขาย`} />
          <Kpi label="เงินโอน / QR" value={transfer} sub={`${pct(transfer)}% ของยอดขาย`} />
          <Kpi label="เฉลี่ยต่อบิล" value={rows.length ? Math.round(total / rows.length) : 0} sub={`ส่วนลดโปรรวม ฿${fmt(discount)}`} />
        </div>

        <div className="mb-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          {/* best sellers */}
          <div className={`${card} p-5`}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-gray-800">สินค้าขายดี</h2>
              <div className="flex gap-1.5">
                <Link prefetch={false} className={chip(sort === "qty")} href={href({ sort: "qty", page: String(page) })}>
                  ตามจำนวนชิ้น
                </Link>
                <Link prefetch={false} className={chip(sort === "amount")} href={href({ sort: "amount", page: String(page) })}>
                  ตามยอดเงิน
                </Link>
              </div>
            </div>
            {best.map((r, i) => {
              const p = PRODUCT_BY_CODE[r.code];
              const v = sort === "qty" ? r.qty : r.amount;
              return (
                <div key={r.code} className="grid grid-cols-[24px_44px_minmax(0,1fr)_auto] items-center gap-3 border-t border-gray-100 py-2.5 first:border-0">
                  <span className={`text-center font-bold ${i < 3 && r.qty ? "text-amber-600" : "text-gray-300"}`}>{i + 1}</span>
                  {p ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image} alt="" className="h-11 w-11 rounded-md border border-gray-200 object-contain" />
                  ) : (
                    <span />
                  )}
                  <div>
                    <div className="text-sm font-medium text-gray-800">{shortName(r.code, r.name)}</div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${(v / max) * 100}%` }} />
                    </div>
                  </div>
                  <div className="whitespace-nowrap text-right text-sm">
                    <div className="font-semibold">{sort === "qty" ? `${fmt(r.qty)} ชิ้น` : `฿${fmt(r.amount)}`}</div>
                    <div className="text-xs text-gray-500">{sort === "qty" ? `฿${fmt(r.amount)}` : `${fmt(r.qty)} ชิ้น`}</div>
                  </div>
                </div>
              );
            })}
            <p className="mt-2 text-xs text-gray-400">ยอดเงินคิดตามราคาปกติ ส่วนลดโปรแสดงแยกในการ์ดด้านบน</p>
          </div>

          <div className="space-y-5">
            <div className={`${card} p-5`}>
              <h2 className="font-semibold text-gray-800">สัดส่วนการชำระเงิน</h2>
              <div className="my-3 flex h-2.5 overflow-hidden rounded-full bg-gray-100">
                <div className="bg-brand-500" style={{ width: `${pct(cash)}%` }} />
                <div className="bg-blue-400" style={{ width: `${pct(transfer)}%` }} />
              </div>
              <div className="flex gap-4 text-sm text-gray-600">
                <span className="flex items-center gap-1.5">
                  <i className="h-2.5 w-2.5 rounded-sm bg-brand-500" /> เงินสด {pct(cash)}%
                </span>
                <span className="flex items-center gap-1.5">
                  <i className="h-2.5 w-2.5 rounded-sm bg-blue-400" /> โอน / QR {pct(transfer)}%
                </span>
              </div>
            </div>
            <div className={`${card} p-5`}>
              <h2 className="mb-1 font-semibold text-gray-800">ยอดตามงาน Event</h2>
              {[...byEvent.entries()]
                .sort((a, b) => b[1].t - a[1].t)
                .map(([name, r]) => (
                  <div key={name} className="flex justify-between gap-3 border-t border-gray-100 py-2.5 text-sm first:border-0">
                    <div>
                      {name}
                      <div className="text-xs text-gray-500">
                        {r.days.size} วัน · {r.n} บิล
                      </div>
                    </div>
                    <b className="whitespace-nowrap">฿{fmt(r.t)}</b>
                  </div>
                ))}
              {byEvent.size === 0 && <p className="py-3 text-center text-sm text-gray-400">ไม่มีข้อมูล</p>}
            </div>
          </div>
        </div>

        {/* all bills */}
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <form method="get" action="/pos-booth/report" className="flex flex-wrap items-center gap-2 border-b border-gray-200 p-3">
            <h2 className="mr-auto px-1 font-semibold text-gray-800">รายการบิลทั้งหมด</h2>
            <input type="hidden" name="from" value={all ? "all" : from} />
            {!all && <input type="hidden" name="to" value={to} />}
            <input type="hidden" name="event" value={event} />
            <input type="hidden" name="sort" value={sort} />
            <input name="q" defaultValue={q} placeholder="ค้นหาเลขบิล / งาน / พนักงาน" className={`${input} min-w-[200px] flex-1`} />
            <select name="pay" defaultValue={pay} className={input}>
              <option value="">ทุกการชำระ</option>
              <option value="cash">เงินสด</option>
              <option value="transfer">โอน / QR</option>
            </select>
            <button className="rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">ค้นหา</button>
          </form>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2">เลขบิล</th>
                  <th className="px-4 py-2">วันที่</th>
                  <th className="px-4 py-2">เวลา</th>
                  <th className="px-4 py-2">งาน Event</th>
                  <th className="px-4 py-2">พนักงาน</th>
                  <th className="px-4 py-2">รายการ</th>
                  <th className="px-4 py-2">ชำระ</th>
                  <th className="px-4 py-2 text-right">ส่วนลด</th>
                  <th className="px-4 py-2 text-right">ยอด</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pageRows.map((b) => (
                  <tr key={b.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-2 font-medium text-brand-700">{b.bill_code}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-gray-500">{thDate(b.business_date)}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-gray-500">{hm(b.paid_at)}</td>
                    <td className="px-4 py-2">{b.shift?.event_name}</td>
                    <td className="whitespace-nowrap px-4 py-2">{b.shift?.staff_name}</td>
                    <td className="min-w-[220px] px-4 py-2 text-gray-600">
                      {b.items.map((i) => `${shortName(i.product_code, i.product_name)} ×${i.quantity}`).join(", ")}
                    </td>
                    <td className="px-4 py-2">
                      {b.payment_method === "cash" ? (
                        <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">เงินสด</span>
                      ) : (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">โอน</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right text-amber-700">{Number(b.discount) ? `−${fmt(b.discount)}` : ""}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right font-semibold">{fmt(b.total)}</td>
                  </tr>
                ))}
                {pageRows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                      ไม่มีบิลในช่วงที่เลือก
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 px-4 py-3 text-sm text-gray-500">
            <span>
              แสดง {list.length ? (page - 1) * PER_PAGE + 1 : 0}–{Math.min(page * PER_PAGE, list.length)} จาก {list.length} บิล · รวม{" "}
              <b className="text-gray-800">฿{fmt(listTotal)}</b>
            </span>
            <span className="flex items-center gap-2">
              {page > 1 ? (
                <Link prefetch={false} className="rounded-md border border-gray-300 px-3 py-1 hover:bg-gray-50" href={href({ page: String(page - 1) })}>
                  ก่อนหน้า
                </Link>
              ) : (
                <span className="rounded-md border border-gray-200 px-3 py-1 text-gray-300">ก่อนหน้า</span>
              )}
              {page} / {pages}
              {page < pages ? (
                <Link prefetch={false} className="rounded-md border border-gray-300 px-3 py-1 hover:bg-gray-50" href={href({ page: String(page + 1) })}>
                  ถัดไป
                </Link>
              ) : (
                <span className="rounded-md border border-gray-200 px-3 py-1 text-gray-300">ถัดไป</span>
              )}
            </span>
          </div>
        </div>
      </main>
    </>
  );
}

function Kpi({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="mt-0.5 text-2xl font-bold text-brand-700">฿{fmt(value)}</div>
      <div className="text-xs text-gray-500">{sub}</div>
    </div>
  );
}
