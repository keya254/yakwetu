import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { AUTH_COOKIE_PREFIX } from "@/lib/auth-cookie";

/**
 * Optimistic check only: no session cookie at all means signed out, so skip
 * the render and go straight to sign-in. A cookie being present proves
 * nothing (it may be expired or revoked), so pages still verify the session on
 * the server, and nothing here redirects *because* a cookie exists — that is
 * what turns a stale cookie into a redirect loop.
 */
export function proxy(request: NextRequest) {
  if (getSessionCookie(request, { cookiePrefix: AUTH_COOKIE_PREFIX })) return NextResponse.next();
  const url = new URL("/sign-in", request.url);
  url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  // Movie pages are public; playing a film asks for an account in place.
  matcher: ["/browse/:path*", "/my-films/:path*"],
};
