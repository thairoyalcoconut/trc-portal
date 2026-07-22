import Link from "next/link";
import { signOut } from "@/app/login/actions";
import type { CurrentProfile } from "@/lib/profile";

export default function Nav({ profile }: { profile: CurrentProfile }) {
  const links = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/records", label: "Records" },
    { href: "/requests", label: "Requests" },
  ];
  if (profile.role === "admin") {
    links.push({ href: "/admin", label: "Admin" });
  }

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <span className="text-lg font-semibold text-brand-700">TRC Portal</span>
          <nav className="flex gap-4 text-sm">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="text-gray-600 hover:text-brand-700">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <div className="text-right leading-tight">
            <div className="font-medium text-gray-800">
              {profile.full_name || profile.email}
            </div>
            <div className="text-xs text-gray-400">
              {profile.department_name ?? "No department assigned"} · {profile.role}
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
