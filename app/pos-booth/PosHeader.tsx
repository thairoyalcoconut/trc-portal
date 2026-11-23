import Link from "next/link";

export type PosTab = "sale" | "exp" | "close" | "report";

const TABS: { key: PosTab; label: string }[] = [
  { key: "sale", label: "ขาย" },
  { key: "exp", label: "ค่าใช้จ่าย" },
  { key: "close", label: "ปิดร้าน" },
  { key: "report", label: "รายงาน" },
];

/**
 * Title + tab bar shared by the POS screen and the report screen.
 * On the POS screen `onTab` switches tabs in place; elsewhere tabs are links.
 */
export default function PosHeader({
  active,
  chips,
  onTab,
  shiftOpen,
  counts,
  saleLabel,
}: {
  active: PosTab;
  chips?: React.ReactNode;
  onTab?: (t: PosTab) => void;
  shiftOpen?: boolean;
  counts?: Partial<Record<PosTab, number>>;
  saleLabel?: string;
}) {
  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">POS-ออกบูท</h1>
          <p className="mt-1 text-sm text-gray-500">ขายหน้าบูท · ค่าใช้จ่าย · ปิดร้าน · รายงานยอดขาย</p>
        </div>
        {chips && <div className="flex flex-wrap gap-2 sm:ml-auto">{chips}</div>}
      </div>
      <div className="mb-5 mt-4 flex gap-1 overflow-x-auto border-b border-gray-200">
        {TABS.map((t) => {
          const disabled = onTab && !shiftOpen && (t.key === "exp" || t.key === "close");
          const cls = `-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm ${
            active === t.key
              ? "border-brand-600 font-semibold text-brand-700"
              : disabled
                ? "cursor-not-allowed border-transparent text-gray-300"
                : "border-transparent text-gray-600 hover:text-brand-700"
          }`;
          const label = t.key === "sale" && saleLabel ? saleLabel : t.label;
          const n = counts?.[t.key];
          const inner = (
            <>
              {label}
              {n ? <span className="rounded-full bg-gray-100 px-1.5 text-xs text-gray-600">{n}</span> : null}
            </>
          );
          if (onTab && t.key !== "report")
            return (
              <button key={t.key} type="button" className={cls} disabled={disabled} onClick={() => onTab(t.key)}>
                {inner}
              </button>
            );
          return (
            <Link key={t.key} prefetch={false} href={t.key === "report" ? "/pos-booth/report" : `/pos-booth?tab=${t.key}`} className={cls}>
              {inner}
            </Link>
          );
        })}
      </div>
    </>
  );
}
