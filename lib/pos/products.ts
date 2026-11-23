// POS-ออกบูท — product catalogue and promotion rules.
//
// To change a price, add a product or edit the promotion, edit this file
// and redeploy. Prices are also snapshotted onto every paid bill item, so
// changing a price here never rewrites old bills or past reports.

export type Flavor = "ORIGINAL" | "TOMYUM" | "LARB" | "MALA";

export type PosProduct = {
  code: string;
  brand: "ASARI" | "Maeice Mahachai";
  group: "asari" | "mmclam" | "shrimp";
  name: string;
  flavor: Flavor;
  price: number;
  image: string;
  /** Counts toward the Maeice Mahachai crispy clam promotion. */
  promo?: boolean;
  /** Big flavor label drawn over the photo (used where photos look identical). */
  ribbon?: string;
};

export const FLAVORS: Record<Flavor, { label: string; bg: string; fg: string; solid: string }> = {
  ORIGINAL: { label: "รสดั้งเดิม", bg: "#e0f2f4", fg: "#0e6e7e", solid: "#0e7c8c" },
  TOMYUM: { label: "รสต้มยำ", bg: "#fdeedd", fg: "#b5601a", solid: "#d9661c" },
  LARB: { label: "รสลาบ", bg: "#e6f5e2", fg: "#3c7a28", solid: "#3c7a28" },
  MALA: { label: "รสหม่าล่า", bg: "#fbe3e1", fg: "#b0332a", solid: "#b0332a" },
};

export const PRODUCTS: PosProduct[] = [
  { code: "AS-OR", brand: "ASARI", group: "asari", name: "Baby Crispy Clam", flavor: "ORIGINAL", price: 30, image: "/pos/as-or.jpg" },
  { code: "AS-TY", brand: "ASARI", group: "asari", name: "Baby Crispy Clam", flavor: "TOMYUM", price: 30, image: "/pos/as-ty.jpg" },
  { code: "MM-LB", brand: "Maeice Mahachai", group: "mmclam", name: "Baby Crispy Clam", flavor: "LARB", price: 69, image: "/pos/mm-lb.jpg", promo: true },
  { code: "MM-ML", brand: "Maeice Mahachai", group: "mmclam", name: "Baby Crispy Clam", flavor: "MALA", price: 69, image: "/pos/mm-ml.jpg", promo: true },
  { code: "MM-OR", brand: "Maeice Mahachai", group: "mmclam", name: "Baby Crispy Clam", flavor: "ORIGINAL", price: 69, image: "/pos/mm-or.jpg", promo: true },
  { code: "MM-TY", brand: "Maeice Mahachai", group: "mmclam", name: "Baby Crispy Clam", flavor: "TOMYUM", price: 69, image: "/pos/mm-ty.jpg", promo: true },
  { code: "SC-OR", brand: "Maeice Mahachai", group: "shrimp", name: "Shrimp Chin", flavor: "ORIGINAL", price: 40, image: "/pos/sc-or.jpg", ribbon: "รสออริจินอล" },
  { code: "SC-TY", brand: "Maeice Mahachai", group: "shrimp", name: "Shrimp Chin", flavor: "TOMYUM", price: 40, image: "/pos/sc-ty.jpg", ribbon: "รสต้มยำ" },
];

export const PRODUCT_BY_CODE: Record<string, PosProduct> = Object.fromEntries(PRODUCTS.map((p) => [p.code, p]));

/** Full name stored on bill items, e.g. "MAEICE MAHACHAI BABY CRISPY CLAM - LARB". */
export const fullName = (p: PosProduct) => `${p.brand.toUpperCase()} ${p.name.toUpperCase()} - ${p.flavor}`;

/** Short Thai label for tables, e.g. "แม่ไอซ์ หอยลาย ลาบ". */
export function shortName(code: string, fallback?: string) {
  const p = PRODUCT_BY_CODE[code];
  if (!p) return fallback ?? code;
  const brand = p.brand === "ASARI" ? "ASARI" : "แม่ไอซ์";
  const kind = p.group === "shrimp" ? "คางกุ้ง" : "หอยลาย";
  return `${brand} ${kind} ${(p.ribbon ?? FLAVORS[p.flavor].label).replace("รส", "")}`;
}

// ---------------------------------------------------------------------------
// Promotion: Maeice Mahachai Baby Crispy Clam, any flavor (mix allowed)
//   2 = 135, 3 = 200, 4 = 260, 8 = 505 (1 = normal price 69)
// For quantities between tiers the cheapest combination is used,
// e.g. 5 = 4 (260) + 1 (69) = 329, 10 = 8 (505) + 2 (135) = 640.
// ---------------------------------------------------------------------------
export const PROMO_UNIT_PRICE = 69;
export const PROMO_TIERS: [qty: number, price: number][] = [
  [8, 505],
  [4, 260],
  [3, 200],
  [2, 135],
  [1, PROMO_UNIT_PRICE],
];

export function promoPrice(n: number): { price: number; label: string } {
  const best: number[] = [0];
  const how: number[][] = [[]];
  for (let i = 1; i <= n; i++) {
    best[i] = Infinity;
    for (const [q, p] of PROMO_TIERS) {
      if (q <= i && best[i - q] + p < best[i]) {
        best[i] = best[i - q] + p;
        how[i] = [...how[i - q], q];
      }
    }
  }
  const counts = new Map<number, number>();
  for (const q of how[n] ?? []) counts.set(q, (counts.get(q) ?? 0) + 1);
  const label = [...counts.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([q, c]) => `${c > 1 ? `${c}×` : ""}${q} ชิ้น ${PROMO_TIERS.find((t) => t[0] === q)![1]}`)
    .join(" + ");
  return { price: best[n] ?? 0, label };
}

export type CartItems = Record<string, number>; // product code -> quantity

export type BillCalc = {
  qty: number;
  subtotal: number;
  promoQty: number;
  promoNormal: number;
  eligible: boolean;
  applied: boolean;
  discount: number;
  total: number;
  promoLabel: string | null;
};

/** Single source of truth for bill totals — used by the browser and re-run on the server when paying. */
export function calcBill(items: CartItems, usePromo: boolean): BillCalc {
  let subtotal = 0;
  let qty = 0;
  let promoQty = 0;
  for (const [code, q] of Object.entries(items)) {
    const p = PRODUCT_BY_CODE[code];
    if (!p || !(q > 0)) continue;
    subtotal += p.price * q;
    qty += q;
    if (p.promo) promoQty += q;
  }
  const promoNormal = promoQty * PROMO_UNIT_PRICE;
  const pc = promoQty >= 2 ? promoPrice(promoQty) : null;
  const eligible = !!pc && pc.price < promoNormal;
  const applied = eligible && usePromo;
  const discount = applied ? promoNormal - pc!.price : 0;
  return {
    qty,
    subtotal,
    promoQty,
    promoNormal,
    eligible,
    applied,
    discount,
    total: subtotal - discount,
    promoLabel: eligible ? `${promoQty} ชิ้น = ${pc!.label}` : null,
  };
}

export const LOCKED_REPORT_EMAIL = "nattamon@thairoyalcoconut.com";
