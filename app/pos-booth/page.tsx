import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { canUsePos } from "@/lib/pos/access";
import Nav from "@/components/Nav";
import NoDepartment from "@/components/NoDepartment";
import type { PosBill, PosExpense, PosShift } from "@/lib/pos/types";
import PosApp from "./PosApp";

export const dynamic = "force-dynamic";

export default async function PosBoothPage({ searchParams }: { searchParams: { tab?: string } }) {
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

  const supabase = createClient();

  // Resume this user's open shift if there is one (e.g. after a page refresh).
  const { data: shift } = await supabase
    .from("pos_shifts")
    .select("id, event_name, staff_name, opening_float, opened_at, business_date, status")
    .eq("opened_by", profile.id)
    .eq("status", "open")
    .maybeSingle();

  let bills: PosBill[] = [];
  let expenses: PosExpense[] = [];
  if (shift) {
    const [b, e] = await Promise.all([
      supabase
        .from("pos_bills")
        .select(
          "id, bill_code, bill_no, business_date, paid_at, payment_method, subtotal, discount, total, cash_received, promo_label, items:pos_bill_items(product_code, product_name, unit_price, quantity)"
        )
        .eq("shift_id", shift.id)
        .order("paid_at"),
      supabase.from("pos_expenses").select("id, item, amount, source, note, created_at").eq("shift_id", shift.id).order("created_at"),
    ]);
    bills = (b.data ?? []) as PosBill[];
    expenses = (e.data ?? []) as PosExpense[];
  }

  // Recent event names for the "ชื่องาน Event" suggestions.
  const { data: recent } = await supabase
    .from("pos_shifts")
    .select("event_name")
    .order("opened_at", { ascending: false })
    .limit(50);
  const eventSuggestions = [...new Set((recent ?? []).map((r) => r.event_name))].slice(0, 10);

  return (
    <>
      <Nav profile={profile} />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <PosApp
          staffName={profile.full_name || profile.email || ""}
          staffEmail={profile.email ?? ""}
          initialShift={(shift as PosShift) ?? null}
          initialBills={bills}
          initialExpenses={expenses}
          eventSuggestions={eventSuggestions}
          initialTab={searchParams.tab === "exp" || searchParams.tab === "close" ? searchParams.tab : "sale"}
        />
      </main>
    </>
  );
}
