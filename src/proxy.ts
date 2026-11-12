import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic auth gate: bounce visitors without a session cookie to /login.
 * This is NOT the security boundary — every page/action re-validates via requireCompany().
 */
export function proxy(request: NextRequest) {
  // Must match COOKIE_PREFIX in src/lib/auth.ts (not imported: that module is server-only and heavy).
  if (!getSessionCookie(request, { cookiePrefix: "gst" })) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/c/:path*", "/onboarding", "/companies", "/admin/:path*", "/admin"],
};
