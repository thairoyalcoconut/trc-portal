import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the auth session on every request and enforces "must be
// logged in" for all pages except /login and static assets.
//
// Guarded with a timeout: if Supabase Auth is slow or unreachable (e.g.
// the project is paused, cold-starting, or having an outage), we fail
// fast instead of letting Vercel kill the whole site with a
// MIDDLEWARE_INVOCATION_TIMEOUT (25s) 504 on every route.
const AUTH_CHECK_TIMEOUT_MS = 8000;

function withTimeout(promise: Promise<any>, ms: number): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("auth_check_timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
      );
  });
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

const supabase = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        request.cookies.set({ name, value, ...options });
        response = NextResponse.next({ request: { headers: request.headers } });
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        request.cookies.set({ name, value: "", ...options });
        response = NextResponse.next({ request: { headers: request.headers } });
        response.cookies.set({ name, value: "", ...options });
      },
    },
  }
  );

const isLoginPage = request.nextUrl.pathname.startsWith("/login");
  const isAuthCallback = request.nextUrl.pathname.startsWith("/auth");

let user = null;
  try {
    const {
      data: { user: fetchedUser },
    } = await withTimeout(supabase.auth.getUser(), AUTH_CHECK_TIMEOUT_MS);
    user = fetchedUser;
  } catch (error) {
    console.error("[middleware] auth check failed or timed out:", error);
    if (!isLoginPage && !isAuthCallback) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("redirectedFrom", request.nextUrl.pathname);
      url.searchParams.set("authError", "1");
      return NextResponse.redirect(url);
    }
    return response;
  }

if (!user && !isLoginPage && !isAuthCallback) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("redirectedFrom", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

if (user && isLoginPage) {
  const url = request.nextUrl.clone();
  url.pathname = "/dashboard";
  url.search = "";
  return NextResponse.redirect(url);
}

return response;
}
