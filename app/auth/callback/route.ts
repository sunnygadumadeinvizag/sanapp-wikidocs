import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAppSession } from "@/lib/session";
import { checkAppAccess, exchangeCode, fetchUserInfo, verifyIdToken } from "@/lib/sso";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const storedState = request.cookies.get("app1_oauth_state")?.value;
  if (!code || !state || state !== storedState) {
    return NextResponse.redirect(new URL("/?error=state_mismatch", request.url));
  }

  try {
    // 1. Identity — ask the SSO who the user is (token exchange + userinfo,
    //    id_token signature verified against the SSO JWKS).
    const tokens = await exchangeCode(code);
    await verifyIdToken(tokens.id_token);
    const user = await fetchUserInfo(tokens.access_token);

    // 2. Central application access — ask Main: is this user allowed in?
    const access = await checkAppAccess({ sub: user.sub, username: user.username });
    if (!access.allowed) {
      const res = NextResponse.redirect(new URL("/access-denied", request.url));
      res.cookies.delete("app1_oauth_state");
      return res;
    }

    // 3. Local role — App1 owns its own roles. Existing users keep their role;
    //    new users start as VIEWER (an ADMIN can change it inside the app).
    const localUser = await prisma.appUser.upsert({
      where: { username: user.username },
      update: { ssoUserId: user.sub, name: user.name, email: user.email },
      create: {
        ssoUserId: user.sub,
        username: user.username,
        name: user.name,
        email: user.email,
        role: "VIEWER",
      },
    });

    const session = await createAppSession({
      sub: user.sub,
      username: user.username,
      name: user.name,
      email: user.email,
      role: localUser.role,
    });

    // Return the user to the page they were on before being sent to the SSO.
    const returnTo = request.cookies.get("app1_return_to")?.value ?? "/";
    const safeReturn =
      returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
    const res = NextResponse.redirect(new URL(safeReturn, request.url));
    res.cookies.delete("app1_return_to");
    res.cookies.set("app1_session", session, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8,
      secure: process.env.NODE_ENV === "production",
    });
    res.cookies.delete("app1_oauth_state");
    return res;
  } catch (err) {
    console.error("App1 SSO callback failed:", err);
    return NextResponse.redirect(new URL("/?error=signin_failed", request.url));
  }
}
