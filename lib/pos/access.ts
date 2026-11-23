import type { CurrentProfile } from "@/lib/profile";

/** POS-ออกบูท is a Marketing module: Marketing members and admins only (same as the Nav menu). */
export function canUsePos(profile: CurrentProfile) {
  return profile.role === "admin" || profile.department_names.includes("Marketing");
}
