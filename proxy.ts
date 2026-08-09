import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifyAppSession } from "@/lib/session";
import { buildAuthorizeUrl } from "@/lib/sso";

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const isPublic =
    pathname === "/auth/callback" ||
    pathname === "/access-denied" ||
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.match(/\.(svg|png|jpg|jpeg|gif|webp|ico)$/);

  if (isPublic) {
    return NextResponse.next();
  }

  const session = request.cookies.get(SESSION_COOKIE)?.value;
  const valid = session ? await verifyAppSession(session) : null;
  if (!valid) {
    const state = crypto.randomUUID().replaceAll("-", "");
    const authorizeUrl = buildAuthorizeUrl(state);

    const res = NextResponse.redirect(authorizeUrl);
    res.cookies.set("app1_oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 300,
    });
    // Remember where the user was so the callback can send them back.
    res.cookies.set("app1_return_to", pathname + search, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
