"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";

type PR = {
  id: string;
  pr_no: string;
  request_date: string | null;
  request_department: string | null;
  status: string;
};

type SortKey = "pr_no" | "request_date" | "request_department" | "status";

const inputClass =
  "w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

// Excel-style filter bar (text/date-range/dropdown filters + sortable column
// headers) for the Purchasing Requests list. Data is fetched server-side in
// page.tsx and passed in whole; filtering/sorting happens client-side since
// the list is small (department-scale, not company-wide), same trade-off
// SaleOrderForm.tsx makes for its own client-side item state.
export default function PurchaseRequestTable({ prs }: { prs: PR[] }) {
  const [prNoFilter, setPrNoFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  const departments = useMemo(
    () =>
      (Array.from(new Set(prs.map((p) => p.request_department).filter(Boolean))) as string[]).sort(),
    [prs]
  );

  const statuses = useMemo(
    () => Array.from(new Set(prs.map((p) => p.status).filter(Boolean))).sort(),
    [prs]
  );

  const filtered = useMemo(() => {
    const rows = prs.filter((p) => {
      if (prNoFilter && !p.pr_no.toLowerCase().includes(prNoFilter.toLowerCase())) return false;
      if (dateFrom && (!p.request_date || p.request_date < dateFrom)) return false;
      if (dateTo && (!p.request_date || p.request_date > dateTo)) return false;
      if (departmentFilter && p.request_department !== departmentFilter) return false;
      if (statusFilter && p.status !== statusFilter) return false;
      return true;
    });

    if (!sortKey) return rows;

    return [...rows].sort((a, b) => {
      const av = (a[sortKey] ?? "").toString();
      const bv = (b[sortKey] ?? "").toString();
      const cmp = av.localeCompare(bv);
      return sortAsc ? cmp : -cmp;
    });
  }, [prs, prNoFilter, dateFrom, dateTo, departmentFilter, statusFilter, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  function clearFilters() {
    setPrNoFilter("");
    setDateFrom("");
    setDateTo("");
    setDepartmentFilter("");
    setStatusFilter("");
  }

  const hasActiveFilters = Boolean(
    prNoFilter || dateFrom || dateTo || departmentFilter || statusFilter
  );

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return null;
    return sortAsc ? " ▲" : " ▼";
  }

  function headerClass(key: SortKey) {
    return `cursor-pointer select-none px-4 py-2 hover:text-gray-700 ${
      sortKey === key ? "text-gray-700" : ""
    }`;
  }

  return (
    <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="grid grid-cols-1 gap-3 border-b border-gray-100 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400">
            PR No.
          </span>
          <input
            className={inputClass}
            placeholder="Search PR No."
            value={prNoFilter}
            onChange={(e) => setPrNoFilter(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400">
            Date from
          </span>
          <input
            type="date"
            className={inputClass}
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400">
            Date to
          </span>
          <input
            type="date"
            className={inputClass}
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400">
            Department
          </span>
          <select
            className={inputClass}
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
          >
            <option value="">All</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400">
            Status
          </span>
          <select
            className={inputClass}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2 text-xs text-gray-500">
        <span>
          Showing {filtered.length} of {prs.length}
        </span>
        {hasActiveFilters && (
          <button type="button" onClick={clearFilters} className="text-brand-600 hover:underline">
            Clear filters
          </button>
        )}
      </div>

      <table className="min-w-full divide-y divide-gray-100 text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
          <tr>
            <th className={headerClass("pr_no")} onClick={() => toggleSort("pr_no")}>
              PR No.{sortIndicator("pr_no")}
            </th>
            <th className={headerClass("request_date")} onClick={() => toggleSort("request_date")}>
              Date{sortIndicator("request_date")}
            </th>
            <th
              className={headerClass("request_department")}
              onClick={() => toggleSort("request_department")}
            >
              Department{sortIndicator("request_department")}
            </th>
            <th className={headerClass("status")} onClick={() => toggleSort("status")}>
              Status{sortIndicator("status")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {filtered.map((p) => (
            <tr key={p.id}>
              <td className="px-4 py-2 font-medium text-brand-700">
                <Link href={`/purchasing/${p.id}`} className="hover:underline">
                  {p.pr_no}
                </Link>
              </td>
              <td className="px-4 py-2 text-gray-500">{p.request_date}</td>
              <td className="px-4 py-2 text-gray-700">{p.request_department}</td>
              <td className="px-4 py-2">
                <StatusBadge status={p.status} />
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                No purchasing requests match the filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
