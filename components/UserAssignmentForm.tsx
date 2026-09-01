"use client";

import { useState, useTransition } from "react";
import { updateUserAssignment } from "@/app/admin/actions";

type Department = { id: string; name: string };

export default function UserAssignmentForm({
  userId,
  fullName: initialFullName,
  role: initialRole,
  departments,
  assignedDepartmentIds,
}: {
  userId: string;
  fullName: string | null;
  role: string;
  departments: Department[];
  assignedDepartmentIds: string[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(assignedDepartmentIds));
  const [role, setRole] = useState(initialRole);
  const [fullName, setFullName] = useState(initialFullName || "");
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  function toggleDepartment(id: string) {
    setStatus(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSave() {
    setStatus(null);
    startTransition(async () => {
      const result = await updateUserAssignment({
        userId,
        departmentIds: Array.from(selected),
        role,
        fullName,
      });
      setStatus(
        result.ok
          ? { ok: true, message: "Saved" }
          : { ok: false, message: result.error || "Save failed — try again" }
      );
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-gray-100 p-3">
      <input
        type="text"
        value={fullName}
        onChange={(e) => {
          setStatus(null);
          setFullName(e.target.value);
        }}
        placeholder="Full name"
        className="w-40 shrink-0 rounded-md border border-gray-200 px-2 py-1.5 text-sm font-medium text-gray-800 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />

      <div className="flex flex-1 flex-wrap gap-2">
        {departments.length === 0 && (
          <span className="text-xs text-gray-400">No departments yet</span>
        )}
        {departments.map((d) => (
          <label
            key={d.id}
            className="flex cursor-pointer items-center gap-1.5 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
          >
            <input
              type="checkbox"
              checked={selected.has(d.id)}
              onChange={() => toggleDepartment(d.id)}
              className="accent-brand-600"
            />
            {d.name}
          </label>
        ))}
      </div>

      <select
        value={role}
        onChange={(e) => {
          setStatus(null);
          setRole(e.target.value);
        }}
        className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
      >
        <option value="staff">staff</option>
        <option value="manager">manager</option>
        <option value="admin">admin</option>
      </select>

      <button
        type="button"
        onClick={handleSave}
        disabled={isPending}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Save"}
      </button>

      {status && (
        <span className={`text-xs ${status.ok ? "text-green-600" : "text-red-600"}`}>
          {status.message}
        </span>
      )}
    </div>
  );
}
