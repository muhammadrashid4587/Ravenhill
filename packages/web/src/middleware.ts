import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Route protection — cheap cookie-presence gate.
 *
 * Pages under PROTECTED_PREFIXES require a session cookie. If missing,
 * we redirect to /login?from=<original-path> so the client can send them
 * back after sign-in.
 *
 * This is deliberately only a *presence* check; real session validation
 * happens in AuthContext via /api/auth/me. A valid-shaped-but-expired
 * cookie will reach the page, hit /me, fail, and the client redirects —
 * at which point the stale cookie is cleared by the server.
 */

const PROTECTED_PREFIXES = [
  "/home",
  "/dashboard",
  "/chat",
  "/organization",
  "/meetings",
  "/agents",
  "/activity",
  "/audit",
  "/settings",
  "/approval",
  "/approvals",
  "/demo",
];

const SESSION_COOKIE = "ravenhill_session";

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!isProtected(pathname)) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("from", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Exclude static assets, _next internals, and the API-route namespace.
  matcher: [
    "/((?!_next/static|_next/image|favicon.svg|icon.svg|opengraph-image|twitter-image|robots|sitemap).*)",
  ],
};
