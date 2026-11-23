"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  calcBill,
  FLAVORS,
  LOCKED_REPORT_EMAIL,
  PRODUCT_BY_CODE,
  PRODUCTS,
  shortName,
  type CartItems,
} from "@/lib/pos/products";
import { summarizeShift, type ExpenseSource, type PayMethod, type PosBill, type PosExpense, type PosShift } from "@/lib/pos/types";
import { addExpense, closeShift, deleteExpense, openShift, payBill } from "./actions";
import PosHeader, { type PosTab } from "./PosHeader";

// Unpaid bills ("บิล 1, 2, 3") live in the browser only, saved to localStorage
// per shift so a refresh doesn't lose them. A bill is written to the database
// when it is paid.
type Cart = { no: number; items: CartItems; promo: boolean | null; pay: PayMethod; recv: string };

const fmt = (n: number) => Number(n || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });
const hm = (iso: string) => new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
const inputCls =
  "w-full rounded-md border border-gray-300 px-3 py-2.5 text-base focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";
const btnPri =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md bg-brand-600 px-4 py-2.5 font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40";
const btnGh =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2.5 font-medium text-gray-700 hover:bg-gray-50";
const quickCls =
  "rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:border-brand-500 hover:bg-brand-50 hover:text-brand-700";
const card = "rounded-lg border border-gray-200 bg-white";

function storageKey(shiftId: string) {
  return `trc-pos-carts:${shiftId}`;
}

export default function PosApp({
  staffName,
  staffEmail,
  initialShift,
  initialBills,
  initialExpenses,
  eventSuggestions,
  initialTab,
}: {
  staffName: string;
  staffEmail: string;
  initialShift: PosShift | null;
  initialBills: PosBill[];
  initialExpenses: PosExpense[];
  eventSuggestions: string[];
  initialTab: PosTab;
}) {
  const [shift, setShift] = useState<PosShift | null>(initialShift);
  const [paid, setPaid] = useState<PosBill[]>(initialBills);
  const [expenses, setExpenses] = useState<PosExpense[]>(initialExpenses);
  const [carts, setCarts] = useState<Cart[]>([]);
  const [cur, setCur] = useState(1);
  const [tab, setTab] = useState<PosTab>(initialShift ? initialTab : "sale");
  const [filter, setFilter] = useState<"all" | "mmclam" | "asari" | "shrimp">("all");
  const [modal, setModal] = useState<null | { kind: "promo"; thenPay: boolean } | { kind: "paid"; bill: PosBill } | { kind: "close" }>(null);
  const [error, setError] = useState("");
  const [closedInfo, setClosedInfo] = useState<null | { emailSent: boolean; emailError: string | null; recipients: string[]; event: string }>(null);
  const [pending, startTransition] = useTransition();

  // ---- restore / persist open carts ----
  const nextNo = (cs: Cart[], ps: PosBill[]) => Math.max(0, ...cs.map((c) => c.no), ...ps.map((b) => b.bill_no)) + 1;
  useEffect(() => {
    if (!shift) return;
    let saved: Cart[] = [];
    try {
      saved = JSON.parse(localStorage.getItem(storageKey(shift.id)) || "[]");
    } catch {}
    const paidNos = new Set(initialBills.map((b) => b.bill_no));
    saved = saved.filter((c) => !paidNos.has(c.no));
    if (!saved.length) saved = [{ no: nextNo([], initialBills), items: {}, promo: null, pay: "cash", recv: "" }];
    setCarts(saved);
    setCur(saved[0].no);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shift?.id]);
  useEffect(() => {
    if (!shift || !carts.length) return;
    try {
      localStorage.setItem(storageKey(shift.id), JSON.stringify(carts));
    } catch {}
  }, [carts, shift]);

  const cart = carts.find((c) => c.no === cur) ?? carts[0];
  const c = cart ? calcBill(cart.items, !!cart.promo) : null;
  const updateCart = (fn: (c: Cart) => Cart) => setCarts((cs) => cs.map((x) => (x.no === cart.no ? fn(x) : x)));

  function newBill() {
    const no = nextNo(carts, paid);
    setCarts((cs) => [...cs, { no, items: {}, promo: null, pay: "cash", recv: "" }]);
    setCur(no);
  }

  function changeQty(code: string, d: number) {
    const items = { ...cart.items };
    items[code] = Math.max(0, (items[code] || 0) + d);
    if (!items[code]) delete items[code];
    const after = calcBill(items, false);
    const promo = after.promoQty < 2 ? null : cart.promo;
    updateCart((x) => ({ ...x, items, promo }));
    // Ask once per bill, the first time it qualifies for the promotion.
    if (after.eligible && promo === null && d > 0) setModal({ kind: "promo", thenPay: false });
  }

  function decidePromo(use: boolean) {
    const thenPay = modal?.kind === "promo" && modal.thenPay;
    updateCart((x) => ({ ...x, promo: use }));
    setModal(null);
    if (thenPay) doPay(use);
  }

  function doPay(promoOverride?: boolean) {
    if (!shift || !cart || !c) return;
    const usePromo = promoOverride ?? !!cart.promo;
    if (c.eligible && cart.promo === null && promoOverride === undefined) {
      setModal({ kind: "promo", thenPay: true });
      return;
    }
    setError("");
    startTransition(async () => {
      const res = await payBill({
        shiftId: shift.id,
        billNo: cart.no,
        items: cart.items,
        usePromo,
        paymentMethod: cart.pay,
        cashReceived: cart.pay === "cash" ? Number(cart.recv) : null,
      });
      if (!res.ok) return setError(res.error);
      setPaid((p) => [...p, res.data]);
      const rest = carts.filter((x) => x.no !== cart.no);
      const nextCarts = rest.length ? rest : [{ no: nextNo([], [...paid, res.data]), items: {}, promo: null, pay: "cash" as PayMethod, recv: "" }];
      setCarts(nextCarts);
      setCur(nextCarts[0].no);
      setModal({ kind: "paid", bill: res.data });
    });
  }

  // ======================================================== OPEN SHOP
  if (!shift) {
    if (closedInfo) return <Closed info={closedInfo} onNew={() => setClosedInfo(null)} />;
    return (
      <>
        <PosHeader active="sale" onTab={setTab} shiftOpen={false} saleLabel="เปิดร้าน" chips={<Chip>ยังไม่เปิดร้าน</Chip>} />
        <OpenShop
          staffName={staffName}
          staffEmail={staffEmail}
          suggestions={eventSuggestions}
          onOpen={(s) => {
            setShift(s);
            setPaid([]);
            setExpenses([]);
            setTab("sale");
          }}
        />
      </>
    );
  }

  const openCount = carts.filter((x) => calcBill(x.items, false).qty > 0).length;
  const chips = (
    <>
      <Chip>
        <span className="h-2 w-2 rounded-full bg-green-500" /> เปิดร้าน {hm(shift.opened_at)}
      </Chip>
      <Chip>
        งาน <b className="text-gray-800">{shift.event_name}</b>
      </Chip>
      <Chip>
        พนักงาน <b className="text-gray-800">{shift.staff_name}</b>
      </Chip>
      <Chip>
        เงินทอนตั้งต้น <b className="text-gray-800">{fmt(shift.opening_float)}</b>
      </Chip>
    </>
  );

  return (
    <>
      <PosHeader active={tab} onTab={setTab} shiftOpen counts={{ sale: openCount, exp: expenses.length }} chips={chips} />
      {error && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button onClick={() => setError("")} className="font-medium">
            ปิด
          </button>
        </div>
      )}

      {tab === "sale" && cart && c && (
        <SaleView
          carts={carts}
          cart={cart}
          c={c}
          filter={filter}
          setFilter={setFilter}
          setCur={setCur}
          newBill={newBill}
          changeQty={changeQty}
          updateCart={updateCart}
          pay={() => doPay()}
          pending={pending}
          paid={paid}
        />
      )}
      {tab === "exp" && (
        <ExpenseView
          shiftId={shift.id}
          expenses={expenses}
          onAdd={(e) => setExpenses((x) => [...x, e])}
          onDelete={(id) => setExpenses((x) => x.filter((e) => e.id !== id))}
          setError={setError}
        />
      )}
      {tab === "close" && (
        <CloseView
          shift={shift}
          paid={paid}
          expenses={expenses}
          openBills={carts.filter((x) => calcBill(x.items, false).qty > 0).map((x) => x.no)}
          onClosed={(info) => {
            try {
              localStorage.removeItem(storageKey(shift.id));
            } catch {}
            setClosedInfo({ ...info, event: shift.event_name });
            setShift(null);
            setCarts([]);
            setTab("sale");
          }}
          setError={setError}
        />
      )}

      {modal?.kind === "promo" && c && (
        <Modal>
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-amber-100 text-xl font-bold text-amber-700">%</div>
          <h2 className="text-center text-lg font-semibold">ตรงเงื่อนไขโปรโมชั่น</h2>
          <p className="mt-1 text-center text-sm text-gray-500">
            หอยลายทอดกรอบ แม่ไอซ์ (คละรสได้) ในบิลนี้ <b>{c.promoQty} ชิ้น</b>
            <br />
            ต้องการใช้ราคาโปรโมชั่นไหม?
          </p>
          <div className="mt-4 rounded-md bg-gray-100 px-3 py-2 text-center text-sm text-gray-600">{c.promoLabel}</div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-center">
            <div className="rounded-lg border border-gray-200 p-3">
              <div className="text-xs text-gray-500">ราคาปกติ</div>
              <div className="text-2xl font-bold text-gray-400 line-through">฿{fmt(c.promoNormal)}</div>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="text-xs text-gray-500">ราคาโปร</div>
              <div className="text-2xl font-bold text-amber-700">฿{fmt(c.promoNormal - calcBill(cart.items, true).discount)}</div>
            </div>
          </div>
          <p className="my-3 text-center font-medium text-green-700">ลูกค้าประหยัด ฿{fmt(calcBill(cart.items, true).discount)}</p>
          <div className="grid gap-2">
            <button className={btnPri} onClick={() => decidePromo(true)}>
              ใช้โปรโมชั่น
            </button>
            <button className={btnGh} onClick={() => decidePromo(false)}>
              ไม่ใช้ — คิดราคาปกติ
            </button>
          </div>
        </Modal>
      )}
      {modal?.kind === "paid" && (
        <Modal onClose={() => setModal(null)}>
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-green-100 text-xl font-bold text-green-700">✓</div>
          <h2 className="text-center text-lg font-semibold">บิล {modal.bill.bill_no} ชำระแล้ว</h2>
          <p className="mt-1 text-center text-sm text-gray-500">
            {modal.bill.bill_code} · {modal.bill.payment_method === "cash" ? "เงินสด" : "โอน / QR"} · ยอด ฿{fmt(modal.bill.total)}
            {modal.bill.discount ? ` (ลดโปร ฿${fmt(modal.bill.discount)})` : ""}
          </p>
          {modal.bill.payment_method === "cash" && (
            <div className="mt-4 flex justify-between rounded-md bg-green-50 px-4 py-3 text-xl font-semibold text-green-700">
              <span>ทอนลูกค้า</span>
              <span>฿{fmt(Number(modal.bill.cash_received) - modal.bill.total)}</span>
            </div>
          )}
          <button className={`${btnPri} mt-4 w-full`} onClick={() => setModal(null)}>
            ไปบิลถัดไป
          </button>
        </Modal>
      )}
    </>
  );
}

// ============================================================ pieces

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600">
      {children}
    </span>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-gray-900/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function OpenShop({
  staffName,
  staffEmail,
  suggestions,
  onOpen,
}: {
  staffName: string;
  staffEmail: string;
  suggestions: string[];
  onOpen: (s: PosShift) => void;
}) {
  const [event, setEvent] = useState("");
  const [float, setFloat] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const today = new Date().toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok" });

  return (
    <form
      className={`${card} max-w-lg p-6`}
      onSubmit={(e) => {
        e.preventDefault();
        if (!event.trim() || float === "") return setErr("กรุณาระบุชื่องาน และเงินทอนตั้งต้น");
        setErr("");
        start(async () => {
          const res = await openShift({ eventName: event, openingFloat: Number(float) });
          if (!res.ok) return setErr(res.error);
          onOpen(res.data);
        });
      }}
    >
      <h2 className="text-lg font-semibold text-gray-800">เปิดร้าน — เริ่มขายหน้าบูท</h2>
      <p className="mb-5 text-sm text-gray-500">{today}</p>
      <label className="mb-4 block">
        <span className="mb-1.5 block text-sm font-medium text-gray-700">ชื่องาน Event *</span>
        <input className={inputCls} list="pos-events" value={event} onChange={(e) => setEvent(e.target.value)} placeholder="เช่น OTOP City 2026 — เมืองทองธานี" />
        <datalist id="pos-events">
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </label>
      <div className="mb-4">
        <span className="mb-1.5 block text-sm font-medium text-gray-700">พนักงานขาย</span>
        <div className="flex items-center gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5">
          <div>
            <div className="text-sm text-gray-800">{staffName}</div>
            <div className="text-xs text-gray-500">{staffEmail} · ดึงจากบัญชีที่ล็อกอิน</div>
          </div>
          <span className="ml-auto text-xs text-gray-400">แก้ไขไม่ได้</span>
        </div>
      </div>
      <label className="mb-2 block">
        <span className="mb-1.5 block text-sm font-medium text-gray-700">เงินทอนตั้งต้น (บาท) *</span>
        <input className={inputCls} type="number" inputMode="numeric" min={0} value={float} onChange={(e) => setFloat(e.target.value)} placeholder="0" />
      </label>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {[500, 1000, 1500, 2000].map((v) => (
          <button type="button" key={v} className={quickCls} onClick={() => setFloat(String(v))}>
            {fmt(v)}
          </button>
        ))}
      </div>
      {err && <p className="mb-3 text-sm text-red-600">{err}</p>}
      <button className={`${btnPri} w-full`} disabled={pending}>
        {pending ? "กำลังเปิดร้าน…" : "เปิดร้าน"}
      </button>
    </form>
  );
}

function SaleView(p: {
  carts: Cart[];
  cart: Cart;
  c: ReturnType<typeof calcBill>;
  filter: "all" | "mmclam" | "asari" | "shrimp";
  setFilter: (f: "all" | "mmclam" | "asari" | "shrimp") => void;
  setCur: (n: number) => void;
  newBill: () => void;
  changeQty: (code: string, d: number) => void;
  updateCart: (fn: (c: Cart) => Cart) => void;
  pay: () => void;
  pending: boolean;
  paid: PosBill[];
}) {
  const { cart, c } = p;
  const prods = PRODUCTS.filter((x) => p.filter === "all" || x.group === p.filter);
  const change = cart.pay === "cash" && cart.recv !== "" ? Number(cart.recv) - c.total : null;
  const canPay = c.qty > 0 && !p.pending && (cart.pay === "transfer" || (change !== null && change >= 0));
  const promoPreview = c.eligible ? calcBill(cart.items, true) : null;

  return (
    <>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            {p.carts.map((x) => {
              const q = calcBill(x.items, false).qty;
              const on = x.no === cart.no;
              return (
                <button
                  key={x.no}
                  onClick={() => p.setCur(x.no)}
                  className={`flex min-h-[40px] items-center gap-2 rounded-md border px-4 font-medium ${on ? "border-brand-600 bg-brand-600 text-white" : "border-gray-300 bg-white text-gray-700"}`}
                >
                  บิล {x.no}
                  {q > 0 && <span className={`rounded-full px-1.5 text-xs ${on ? "bg-white/25" : "bg-gray-100 text-gray-600"}`}>{q}</span>}
                </button>
              );
            })}
            <button onClick={p.newBill} className="min-h-[40px] rounded-md border border-dashed border-gray-300 px-4 text-brand-700">
              + บิลใหม่
            </button>
          </div>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {(
              [
                ["all", "ทั้งหมด"],
                ["mmclam", "หอยลาย แม่ไอซ์ (โปร)"],
                ["asari", "ASARI"],
                ["shrimp", "คางกุ้ง"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                onClick={() => p.setFilter(k)}
                className={`rounded-full border px-3 py-1 text-sm ${p.filter === k ? "border-brand-700 bg-brand-700 text-white" : "border-gray-200 bg-white text-gray-600"}`}
              >
                {l}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {prods.map((x) => {
              const q = cart.items[x.code] || 0;
              const f = FLAVORS[x.flavor];
              return (
                <button
                  key={x.code}
                  onClick={() => p.changeQty(x.code, 1)}
                  className="relative flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white text-left hover:border-brand-500 active:scale-[.98]"
                >
                  {x.promo && (
                    <span className="absolute left-2 top-2 z-10 rounded-full border border-amber-200 bg-amber-50 px-2 text-xs font-medium text-amber-700">
                      โปร 2 ชิ้น 135
                    </span>
                  )}
                  {q > 0 && (
                    <span className="absolute right-2 top-2 z-10 grid h-7 min-w-[28px] place-items-center rounded-full bg-brand-600 text-sm font-bold text-white">{q}</span>
                  )}
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={x.image} alt="" className="aspect-square w-full object-contain p-1.5" />
                    {x.ribbon && (
                      <span className="absolute inset-x-2 bottom-2.5 rounded-md py-1 text-center text-base font-bold text-white shadow" style={{ background: f.solid }}>
                        {x.ribbon}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col border-t border-gray-100 px-3 pb-3 pt-2">
                    <div className="text-xs font-medium text-gray-500">{x.brand}</div>
                    <div className="text-sm font-semibold text-gray-800">{x.name}</div>
                    <span className="mt-1 w-fit rounded-full px-2 text-xs font-medium" style={{ background: f.bg, color: f.fg }}>
                      {x.ribbon ?? f.label}
                    </span>
                    <div className="mt-auto pt-2 text-lg font-bold text-brand-700">
                      {x.price} <span className="text-xs font-normal text-gray-500">บาท</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div id="pos-cart" className={`${card} flex flex-col lg:sticky lg:top-4`}>
          <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3">
            <h2 className="font-semibold text-gray-800">บิล {cart.no}</h2>
            <span className="text-sm text-gray-500">{c.qty} ชิ้น</span>
            {c.qty > 0 && (
              <button onClick={() => p.updateCart((x) => ({ ...x, items: {}, promo: null, recv: "" }))} className="ml-auto rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-600">
                ล้างบิล
              </button>
            )}
          </div>
          <div className="max-h-[40vh] overflow-auto px-4 lg:max-h-[45vh]">
            {c.qty === 0 && <p className="py-8 text-center text-sm text-gray-400">แตะสินค้าเพื่อเพิ่มลงบิล</p>}
            {Object.entries(cart.items).map(([code, q]) => {
              const x = PRODUCT_BY_CODE[code];
              if (!x) return null;
              return (
                <div key={code} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-b border-dashed border-gray-200 py-2.5 last:border-0">
                  <div>
                    <div className="text-sm font-medium text-gray-800">{shortName(code)}</div>
                    <div className="text-xs text-gray-500">{x.price} บ. / ชิ้น</div>
                  </div>
                  <div className="text-right font-semibold">{fmt(x.price * q)}</div>
                  <div className="col-span-2 flex items-center gap-1">
                    <button className="h-8 w-8 rounded-md border border-gray-300 text-lg" onClick={() => p.changeQty(code, -1)}>
                      −
                    </button>
                    <span className="w-9 text-center font-semibold">{q}</span>
                    <button className="h-8 w-8 rounded-md border border-gray-300 text-lg" onClick={() => p.changeQty(code, 1)}>
                      +
                    </button>
                    <button className="ml-auto text-sm text-red-600" onClick={() => p.changeQty(code, -999)}>
                      ลบ
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {c.eligible && (
            <div className={`mx-4 mb-3 flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm ${c.applied ? "border-amber-200 bg-amber-50" : "border-gray-200 bg-gray-50"}`}>
              <div>
                <b className={c.applied ? "text-amber-700" : "text-gray-600"}>โปรหอยลายแม่ไอซ์</b>
                <div className="text-xs text-gray-500">{c.promoLabel}</div>
              </div>
              <button className="whitespace-nowrap text-sm font-medium text-brand-700 underline" onClick={() => p.updateCart((x) => ({ ...x, promo: !c.applied }))}>
                {c.applied ? "ไม่ใช้โปร" : `ใช้โปร (ลด ${fmt(promoPreview!.discount)})`}
              </button>
            </div>
          )}
          <div className="border-t border-gray-200 px-4 py-3">
            <div className="flex justify-between text-sm text-gray-600">
              <span>ราคาปกติ</span>
              <span>{fmt(c.subtotal)}</span>
            </div>
            {c.applied && (
              <div className="flex justify-between text-sm text-amber-700">
                <span>ส่วนลดโปรโมชั่น</span>
                <span>−{fmt(c.discount)}</span>
              </div>
            )}
            <div className="my-2 flex justify-between text-2xl font-bold text-gray-900">
              <span>ยอดชำระ</span>
              <span>฿{fmt(c.total)}</span>
            </div>
            <div className="mb-2 grid grid-cols-2 gap-2">
              {(["cash", "transfer"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => p.updateCart((x) => ({ ...x, pay: m }))}
                  className={`min-h-[44px] rounded-md border-2 font-medium ${cart.pay === m ? "border-brand-600 bg-brand-50 text-brand-700" : "border-gray-200 bg-white text-gray-700"}`}
                >
                  {m === "cash" ? "เงินสด" : "โอน / QR"}
                </button>
              ))}
            </div>
            {cart.pay === "cash" ? (
              <>
                <input
                  className={inputCls}
                  type="number"
                  inputMode="numeric"
                  placeholder="รับเงินมา (บาท)"
                  value={cart.recv}
                  onChange={(e) => p.updateCart((x) => ({ ...x, recv: e.target.value }))}
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button className={quickCls} onClick={() => p.updateCart((x) => ({ ...x, recv: String(c.total) }))}>
                    พอดี
                  </button>
                  {[100, 500, 1000]
                    .filter((v) => v > c.total)
                    .map((v) => (
                      <button key={v} className={quickCls} onClick={() => p.updateCart((x) => ({ ...x, recv: String(v) }))}>
                        {fmt(v)}
                      </button>
                    ))}
                </div>
                {change !== null && c.qty > 0 && (
                  <div className={`mt-2 flex justify-between rounded-md px-3 py-2 font-semibold ${change >= 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                    <span>{change >= 0 ? "เงินทอน" : "เงินไม่พอ"}</span>
                    <span>{change >= 0 ? `฿${fmt(change)}` : `ขาด ฿${fmt(-change)}`}</span>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-500">ตรวจสลิปโอนให้ตรงยอดก่อนกดชำระ</p>
            )}
            <button className={`${btnPri} mt-3 w-full text-base`} disabled={!canPay} onClick={p.pay}>
              {p.pending ? "กำลังบันทึก…" : `ชำระเงิน ฿${fmt(c.total)}`}
            </button>
          </div>
        </div>
      </div>

      {p.paid.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 font-semibold text-gray-800">บิลที่ชำระแล้วรอบนี้ ({p.paid.length})</h2>
          <BillTable bills={[...p.paid].reverse()} />
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between bg-brand-700 px-4 py-3 text-white lg:hidden">
        <span>
          บิล {cart.no} · {c.qty} ชิ้น · <b>฿{fmt(c.total)}</b>
        </span>
        <button className="rounded-md bg-white px-3 py-1.5 font-medium text-brand-700" onClick={() => document.getElementById("pos-cart")?.scrollIntoView({ behavior: "smooth" })}>
          ดูบิล
        </button>
      </div>
      <div className="h-14 lg:hidden" />
    </>
  );
}

function BillTable({ bills }: { bills: PosBill[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-100 text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
          <tr>
            <th className="px-4 py-2">เลขบิล</th>
            <th className="px-4 py-2">เวลา</th>
            <th className="px-4 py-2">รายการ</th>
            <th className="px-4 py-2">ชำระ</th>
            <th className="px-4 py-2 text-right">ส่วนลด</th>
            <th className="px-4 py-2 text-right">ยอด</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {bills.map((b) => (
            <tr key={b.id}>
              <td className="whitespace-nowrap px-4 py-2 font-medium text-brand-700">{b.bill_code}</td>
              <td className="whitespace-nowrap px-4 py-2 text-gray-500">{hm(b.paid_at)}</td>
              <td className="px-4 py-2 text-gray-600">{b.items.map((i) => `${shortName(i.product_code, i.product_name)} ×${i.quantity}`).join(", ")}</td>
              <td className="px-4 py-2">
                <PayPill m={b.payment_method} />
              </td>
              <td className="whitespace-nowrap px-4 py-2 text-right text-amber-700">{b.discount ? `−${fmt(b.discount)}` : ""}</td>
              <td className="whitespace-nowrap px-4 py-2 text-right font-semibold">{fmt(b.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PayPill({ m }: { m: PayMethod }) {
  return m === "cash" ? (
    <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">เงินสด</span>
  ) : (
    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">โอน</span>
  );
}

function ExpenseView({
  shiftId,
  expenses,
  onAdd,
  onDelete,
  setError,
}: {
  shiftId: string;
  expenses: PosExpense[];
  onAdd: (e: PosExpense) => void;
  onDelete: (id: string) => void;
  setError: (s: string) => void;
}) {
  const [item, setItem] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [source, setSource] = useState<ExpenseSource>("drawer");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const total = expenses.reduce((a, e) => a + Number(e.amount), 0);

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
      <form
        className={`${card} p-5`}
        onSubmit={(e) => {
          e.preventDefault();
          if (!item.trim() || !(Number(amount) > 0)) return setErr("กรุณาระบุรายการและราคา");
          setErr("");
          start(async () => {
            const res = await addExpense({ shiftId, item, amount: Number(amount), source, note });
            if (!res.ok) return setErr(res.error);
            onAdd(res.data);
            setItem("");
            setAmount("");
            setNote("");
          });
        }}
      >
        <h2 className="font-semibold text-gray-800">บันทึกค่าใช้จ่าย</h2>
        <p className="mb-4 text-sm text-gray-500">ซื้ออะไร ราคาเท่าไหร่ ระหว่างออกบูท</p>
        <label className="mb-3 block">
          <span className="mb-1.5 block text-sm font-medium text-gray-700">ซื้ออะไร *</span>
          <input className={inputCls} list="pos-exp" value={item} onChange={(e) => setItem(e.target.value)} placeholder="เช่น น้ำแข็ง, ถุงหิ้ว, ค่าที่จอดรถ" />
          <datalist id="pos-exp">
            {["น้ำแข็ง", "น้ำดื่มพนักงาน", "ถุงหิ้ว", "ค่าอาหารพนักงาน", "ค่าที่จอดรถ", "ค่าไฟบูท"].map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
        </label>
        <label className="mb-3 block">
          <span className="mb-1.5 block text-sm font-medium text-gray-700">ราคา (บาท) *</span>
          <input className={inputCls} type="number" inputMode="decimal" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
        </label>
        <div className="mb-3">
          <span className="mb-1.5 block text-sm font-medium text-gray-700">จ่ายจาก</span>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["drawer", "เงินสดในลิ้นชัก"],
                ["other", "โอน / เงินส่วนตัว"],
              ] as const
            ).map(([k, l]) => (
              <button
                type="button"
                key={k}
                onClick={() => setSource(k)}
                className={`min-h-[44px] rounded-md border-2 text-sm ${source === k ? "border-brand-600 bg-brand-50 font-medium text-brand-700" : "border-gray-200 bg-white text-gray-700"}`}
              >
                {l}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-gray-500">
            {source === "drawer" ? "จะถูกหักออกจากเงินสดที่ควรมีตอนปิดร้าน" : "ไม่กระทบเงินในลิ้นชัก (บันทึกไว้เบิกคืน)"}
          </p>
        </div>
        <label className="mb-3 block">
          <span className="mb-1.5 block text-sm font-medium text-gray-700">หมายเหตุ</span>
          <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="ไม่บังคับ" />
        </label>
        {err && <p className="mb-2 text-sm text-red-600">{err}</p>}
        <button className={`${btnPri} w-full`} disabled={pending}>
          {pending ? "กำลังบันทึก…" : "+ บันทึกค่าใช้จ่าย"}
        </button>
      </form>
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="font-semibold text-gray-800">รายการค่าใช้จ่ายรอบนี้</h2>
          <b className="text-lg text-brand-700">฿{fmt(total)}</b>
        </div>
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2">เวลา</th>
                <th className="px-4 py-2">รายการ</th>
                <th className="px-4 py-2">จ่ายจาก</th>
                <th className="px-4 py-2 text-right">บาท</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {expenses.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-2 text-gray-500">{hm(e.created_at)}</td>
                  <td className="px-4 py-2">
                    {e.item}
                    {e.note && <div className="text-xs text-gray-500">{e.note}</div>}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${e.source === "drawer" ? "bg-green-50 text-green-700" : "bg-blue-50 text-blue-700"}`}>
                      {e.source === "drawer" ? "ลิ้นชัก" : "โอน/ส่วนตัว"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">{fmt(e.amount)}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      className="text-gray-400 hover:text-red-600"
                      aria-label="ลบ"
                      onClick={async () => {
                        const res = await deleteExpense(e.id);
                        if (!res.ok) return setError(res.error);
                        onDelete(e.id);
                      }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
              {expenses.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                    ยังไม่มีค่าใช้จ่าย
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CloseView({
  shift,
  paid,
  expenses,
  openBills,
  onClosed,
  setError,
}: {
  shift: PosShift;
  paid: PosBill[];
  expenses: PosExpense[];
  openBills: number[];
  onClosed: (info: { emailSent: boolean; emailError: string | null; recipients: string[] }) => void;
  setError: (s: string) => void;
}) {
  const s = useMemo(() => summarizeShift(shift.opening_float, paid, expenses), [shift, paid, expenses]);
  const [counted, setCounted] = useState("");
  const [extra, setExtra] = useState<string[]>([]);
  const [mail, setMail] = useState("");
  const [err, setErr] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const diff = counted === "" ? null : Number(counted) - s.expectedCash;

  function addMail() {
    const v = mail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return setErr("รูปแบบอีเมล์ไม่ถูกต้อง");
    if (v === LOCKED_REPORT_EMAIL || extra.includes(v)) return setErr("มีอีเมล์นี้แล้ว");
    setErr("");
    setExtra([...extra, v]);
    setMail("");
  }

  const Row = ({ a, b, strong }: { a: string; b: string; strong?: boolean }) => (
    <div className={`flex justify-between py-1.5 ${strong ? "mt-1 border-t border-gray-200 pt-2.5 font-semibold" : ""}`}>
      <span>{a}</span>
      <span>{b}</span>
    </div>
  );

  return (
    <>
      {openBills.length > 0 && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ยังมีบิลค้างชำระ: {openBills.map((n) => `บิล ${n}`).join(", ")} — บิลค้างจะไม่ถูกนับในยอดขาย และจะหายไปเมื่อปิดร้าน
        </div>
      )}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="ยอดขายรวม" value={s.totalSales} sub={`${s.billCount} บิล · ${s.pieces} ชิ้น`} />
        <Kpi label="เงินสด" value={s.cashSales} sub={`โอน/QR ฿${fmt(s.transferSales)}`} />
        <Kpi label="ค่าใช้จ่ายรวม" value={s.expenseTotal} sub={`${expenses.length} รายการ`} />
        <Kpi label="คงเหลือหลังหักค่าใช้จ่าย" value={s.totalSales - s.expenseTotal} sub={`ส่วนลดโปรที่ให้ไป ฿${fmt(s.discount)}`} />
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className={`${card} p-5 text-sm`}>
          <h2 className="mb-2 font-semibold text-gray-800">ตรวจนับเงินสด</h2>
          <Row a="เงินทอนตั้งต้น" b={fmt(shift.opening_float)} />
          <Row a="+ ขายเงินสด" b={fmt(s.cashSales)} />
          <Row a="− ค่าใช้จ่ายจากลิ้นชัก" b={fmt(s.expenseDrawer)} />
          <Row a="เงินสดที่ควรมี" b={`฿${fmt(s.expectedCash)}`} strong />
          <label className="mt-3 block">
            <span className="mb-1.5 block font-medium text-gray-700">เงินสดคงเหลือ (นับจริง) *</span>
            <input className={inputCls} type="number" inputMode="decimal" min={0} value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="นับเงินในลิ้นชักแล้วกรอก" />
          </label>
          <div
            className={`mt-3 flex justify-between rounded-md px-3 py-2 font-semibold ${
              diff === null ? "bg-gray-100 text-gray-500" : diff === 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
            }`}
          >
            <span>{diff === null ? "ส่วนต่าง" : diff === 0 ? "เงินตรง" : diff > 0 ? "เงินเกิน" : "เงินขาด"}</span>
            <span>{diff === null ? "รอกรอกยอดนับจริง" : `${diff === 0 ? "0" : (diff > 0 ? "+" : "−") + fmt(Math.abs(diff))} บาท`}</span>
          </div>
        </div>
        <div className="space-y-5">
          <div>
            <h2 className="mb-2 font-semibold text-gray-800">สรุปยอดขายตามสินค้า</h2>
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
              <table className="min-w-full divide-y divide-gray-100 text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-2">สินค้า</th>
                    <th className="px-4 py-2 text-right">ชิ้น</th>
                    <th className="px-4 py-2 text-right">บาท</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {s.byProduct.map((r) => (
                    <tr key={r.code}>
                      <td className="px-4 py-2">{shortName(r.code, r.name)}</td>
                      <td className="px-4 py-2 text-right">{r.qty}</td>
                      <td className="px-4 py-2 text-right">{fmt(r.amount)}</td>
                    </tr>
                  ))}
                  {s.discount > 0 && (
                    <tr>
                      <td className="px-4 py-2 text-amber-700">ส่วนลดโปรโมชั่น</td>
                      <td />
                      <td className="px-4 py-2 text-right text-amber-700">−{fmt(s.discount)}</td>
                    </tr>
                  )}
                  {s.byProduct.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-6 text-center text-gray-400">
                        ยังไม่มียอดขาย
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot className="bg-gray-50 font-semibold">
                  <tr>
                    <td className="px-4 py-2">รวม</td>
                    <td className="px-4 py-2 text-right">{s.pieces}</td>
                    <td className="px-4 py-2 text-right">{fmt(s.totalSales)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
          <div>
            <h2 className="mb-2 font-semibold text-gray-800">สรุปค่าใช้จ่าย</h2>
            <div className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm">
              {expenses.length === 0 && <p className="py-3 text-center text-gray-400">ไม่มีค่าใช้จ่าย</p>}
              {expenses.map((e) => (
                <Row key={e.id} a={`${e.item} (${e.source === "drawer" ? "ลิ้นชัก" : "โอน/ส่วนตัว"})`} b={fmt(e.amount)} />
              ))}
              {expenses.length > 0 && <Row a="รวม" b={fmt(s.expenseTotal)} strong />}
            </div>
          </div>
        </div>
      </div>

      <div className={`${card} mt-5 p-5`}>
        <h2 className="font-semibold text-gray-800">ส่งสรุปทางอีเมล์</h2>
        <p className="mb-3 text-sm text-gray-500">ผู้รับหลักถูกล็อคไว้ เพิ่มผู้รับอื่นได้</p>
        <div className="mb-3 flex flex-wrap gap-2">
          <span className="rounded-full border border-brand-100 bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700">{LOCKED_REPORT_EMAIL} · ล็อค</span>
          {extra.map((m) => (
            <span key={m} className="flex items-center gap-1 rounded-full border border-gray-200 bg-white py-1 pl-3 pr-1 text-sm">
              {m}
              <button className="h-6 w-6 rounded-full text-gray-400 hover:bg-red-50 hover:text-red-600" onClick={() => setExtra(extra.filter((x) => x !== m))} aria-label="ลบ">
                ✕
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className={inputCls}
            type="email"
            value={mail}
            onChange={(e) => setMail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addMail();
              }
            }}
            placeholder="เพิ่มอีเมล์ผู้รับ"
          />
          <button type="button" className={btnGh} onClick={addMail}>
            เพิ่ม
          </button>
        </div>
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
        <button
          className={`${btnPri} mt-4 w-full`}
          onClick={() => {
            if (counted === "") return setErr('กรุณากรอก "เงินสดคงเหลือ (นับจริง)" ก่อนปิดร้าน');
            setErr("");
            setConfirm(true);
          }}
        >
          ปิดร้าน & ส่งสรุปทางอีเมล์
        </button>
      </div>

      {confirm && (
        <Modal onClose={() => !pending && setConfirm(false)}>
          <h2 className="text-center text-lg font-semibold">ยืนยันปิดร้าน?</h2>
          <p className="mb-4 mt-1 text-center text-sm text-gray-500">หลังปิดร้านจะแก้ไขบิล/ค่าใช้จ่ายของรอบนี้ไม่ได้</p>
          <div className="mb-4 text-sm">
            <Row a="ยอดขายรวม" b={`฿${fmt(s.totalSales)}`} />
            <Row a="เงินสดนับจริง" b={`฿${fmt(Number(counted))}`} />
            <Row a="ส่วนต่าง" b={diff === 0 ? "ตรง" : `${diff! > 0 ? "+" : "−"}${fmt(Math.abs(diff!))}`} />
            <div className="flex justify-between gap-4 py-1.5">
              <span>ส่งถึง</span>
              <span className="text-right">{[LOCKED_REPORT_EMAIL, ...extra].join(", ")}</span>
            </div>
          </div>
          <div className="grid gap-2">
            <button
              className={btnPri}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await closeShift({ shiftId: shift.id, countedCash: Number(counted), extraEmails: extra });
                  if (!res.ok) {
                    setConfirm(false);
                    return setError(res.error);
                  }
                  onClosed(res.data);
                })
              }
            >
              {pending ? "กำลังปิดร้าน…" : "ยืนยัน ปิดร้าน & ส่งอีเมล์"}
            </button>
            <button className={btnGh} disabled={pending} onClick={() => setConfirm(false)}>
              ยกเลิก
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function Kpi({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className={`${card} p-4`}>
      <div className="text-sm text-gray-500">{label}</div>
      <div className="mt-0.5 text-2xl font-bold text-brand-700">฿{fmt(value)}</div>
      <div className="text-xs text-gray-500">{sub}</div>
    </div>
  );
}

function Closed({
  info,
  onNew,
}: {
  info: { emailSent: boolean; emailError: string | null; recipients: string[]; event: string };
  onNew: () => void;
}) {
  return (
    <div className={`${card} mx-auto mt-6 max-w-lg p-6 text-center`}>
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-green-100 text-xl font-bold text-green-700">✓</div>
      <h2 className="text-lg font-semibold">ปิดร้านเรียบร้อย — {info.event}</h2>
      {info.emailSent ? (
        <p className="mt-1 text-sm text-gray-500">ส่งสรุปทางอีเมล์ไปที่ {info.recipients.join(", ")} แล้ว</p>
      ) : (
        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          บันทึกการปิดร้านแล้ว แต่ส่งอีเมล์ไม่สำเร็จ: {info.emailError}
          <br />
          ยอดทั้งหมดยังดูได้ในหน้ารายงาน
        </p>
      )}
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Link href="/pos-booth/report" prefetch={false} className={btnGh}>
          ดูรายงาน
        </Link>
        <button className={btnPri} onClick={onNew}>
          เปิดร้านรอบใหม่
        </button>
      </div>
    </div>
  );
}
