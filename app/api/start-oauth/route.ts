import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { buildAuthorizeUrl } from "@/lib/sso";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const store = await cookies();
  const state = crypto.randomUUID().replaceAll("-", "");

  // Remember where the user was heading so login returns to the same wiki page.
  let returnTo = request.nextUrl.searchParams.get("returnTo") ?? "/";
  if (!returnTo.startsWith("/") || returnTo.startsWith("//") || returnTo.includes("..")) {
    returnTo = "/";
  }
  const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
  if (BASE_PATH && returnTo.startsWith(BASE_PATH)) {
    returnTo = returnTo.slice(BASE_PATH.length) || "/";
  }

  const authorizeUrl = buildAuthorizeUrl(state);
  store.set("wikidocs_oauth_state", state, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 300 });
  store.set("wikidocs_return_to", returnTo, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
  return NextResponse.redirect(authorizeUrl);
}
