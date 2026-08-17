import Link from "next/link";
import { signOut } from "@/app/login/actions";
import type { CurrentProfile } from "@/lib/profile";

// Department-specific modules. Add more department -> page mappings here
// as new department pages get built (e.g. Production, Warehouse & Inventory).
const DEPARTMENT_MODULES: Record<string, { href: string; label: string }[]> = {
  Marketing: [{ href: "/sales", label: "Sales Order" }],
  Purchasing: [{ href: "/purchasing", label: "PR" }],
};

export default function Nav({ profile }: { profile: CurrentProfile }) {
  const links = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/records", label: "Records" },
    { href: "/requests", label: "Requests" },
  ];
  if (profile.role === "admin") {
    links.push({ href: "/admin", label: "Admin" });
  }

  // Admins see every department's modules; everyone else sees the
  // modules for every department they belong to (a user can be in
  // more than one).
  const departmentGroups: [string, { href: string; label: string }[]][] =
    profile.role === "admin"
      ? Object.entries(DEPARTMENT_MODULES)
      : profile.department_names
          .filter((name) => DEPARTMENT_MODULES[name])
          .map((name) => [name, DEPARTMENT_MODULES[name]] as [string, { href: string; label: string }[]]);

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <span className="text-lg font-semibold text-brand-700">TRC Portal</span>
          <nav className="flex items-center gap-4 text-sm">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="text-gray-600 hover:text-brand-700">
                {l.label}
              </Link>
            ))}
            {departmentGroups.map(([deptName, modules]) => (
              <details key={deptName} className="relative">
                <summary className="cursor-pointer list-none text-gray-600 hover:text-brand-700">
                  {deptName} <span className="text-xs text-gray-400">▾</span>
                </summary>
                <div className="absolute left-0 top-full z-10 mt-2 min-w-[160px] rounded-md border border-gray-200 bg-white py-1 shadow-md">
                  {modules.map((m) => (
                    <Link
                      key={m.href}
                      href={m.href}
                      className="block px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      {m.label}
                    </Link>
                  ))}
                </div>
              </details>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <div className="text-right leading-tight">
            <div className="font-medium text-gray-800">
              {profile.full_name || profile.email}
            </div>
            <div className="text-xs text-gray-400">
              {profile.department_names.length > 0
                ? profile.department_names.join(", ")
                : "No department assigned"}{" "}
              · {profile.role}
            </div>
          </div>
          <form action={signOut}>
            <button className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
