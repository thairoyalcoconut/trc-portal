import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// This runs before EVERY matched request and is what enforces
// "must be logged in before use" across the whole site.
export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
