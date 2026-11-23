export type PayMethod = "cash" | "transfer";
export type ExpenseSource = "drawer" | "other";

export type PosShift = {
  id: string;
  event_name: string;
  staff_name: string;
  opening_float: number;
  opened_at: string;
  business_date: string;
  status: "open" | "closed";
};

export type PosBillItem = {
  product_code: string;
  product_name: string;
  unit_price: number;
  quantity: number;
};

export type PosBill = {
  id: string;
  bill_code: string;
  bill_no: number;
  business_date: string;
  paid_at: string;
  payment_method: PayMethod;
  subtotal: number;
  discount: number;
  total: number;
  cash_received: number | null;
  promo_label: string | null;
  items: PosBillItem[];
};

export type PosExpense = {
  id: string;
  item: string;
  amount: number;
  source: ExpenseSource;
  note: string | null;
  created_at: string;
};

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export type ShiftSummary = {
  cashSales: number;
  transferSales: number;
  totalSales: number;
  discount: number;
  billCount: number;
  pieces: number;
  expenseDrawer: number;
  expenseOther: number;
  expenseTotal: number;
  expectedCash: number;
  byProduct: { code: string; name: string; qty: number; amount: number }[];
};

export function summarizeShift(openingFloat: number, bills: PosBill[], expenses: PosExpense[]): ShiftSummary {
  const n = (x: number | string | null | undefined) => Number(x ?? 0);
  const cashSales = bills.filter((b) => b.payment_method === "cash").reduce((a, b) => a + n(b.total), 0);
  const transferSales = bills.filter((b) => b.payment_method !== "cash").reduce((a, b) => a + n(b.total), 0);
  const expenseDrawer = expenses.filter((e) => e.source === "drawer").reduce((a, e) => a + n(e.amount), 0);
  const expenseOther = expenses.filter((e) => e.source !== "drawer").reduce((a, e) => a + n(e.amount), 0);
  const map = new Map<string, { code: string; name: string; qty: number; amount: number }>();
  for (const b of bills)
    for (const it of b.items) {
      const row = map.get(it.product_code) ?? { code: it.product_code, name: it.product_name, qty: 0, amount: 0 };
      row.qty += n(it.quantity);
      row.amount += n(it.unit_price) * n(it.quantity);
      map.set(it.product_code, row);
    }
  const byProduct = [...map.values()].sort((a, b) => b.qty - a.qty);
  return {
    cashSales,
    transferSales,
    totalSales: cashSales + transferSales,
    discount: bills.reduce((a, b) => a + n(b.discount), 0),
    billCount: bills.length,
    pieces: byProduct.reduce((a, r) => a + r.qty, 0),
    expenseDrawer,
    expenseOther,
    expenseTotal: expenseDrawer + expenseOther,
    expectedCash: n(openingFloat) + cashSales - expenseDrawer,
    byProduct,
  };
}
