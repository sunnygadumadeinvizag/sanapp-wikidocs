import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { verifyAppSession } from "./session";

/** The locally-provisioned user for the current session, or null. */
export async function currentUser() {
  const store = await cookies();
  const session = store.get("wikidocs_session")?.value;
  const user = session ? await verifyAppSession(session) : null;
  if (!user) return null;
  return prisma.appUser.findUnique({ where: { username: user.username } });
}

/** True when the current user is an app ADMIN. */
export async function isAdmin(): Promise<boolean> {
  const user = await currentUser();
  return user?.role === "ADMIN";
}

const SSO_BASE_URL = process.env.SSO_BASE_URL ?? "";
const SSO_ADMIN_KEY = process.env.SSO_ADMIN_KEY ?? "";

export type SsoUser = {
  id: string;
  username: string;
  name: string;
  email: string | null;
  primaryRole: string;
  isActive: boolean;
};

let ssoUsersCache: { at: number; users: SsoUser[] } | null = null;

/** Users from the central SSO registry (identity lives in sanapp_sso_db). */
export async function listSsoUsers(): Promise<SsoUser[]> {
  if (ssoUsersCache && Date.now() - ssoUsersCache.at < 30_000) {
    return ssoUsersCache.users;
  }
  if (!SSO_ADMIN_KEY) return [];
  try {
    const res = await fetch(`${SSO_BASE_URL}/api/admin/users`, {
      headers: { "x-admin-key": SSO_ADMIN_KEY },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const users: SsoUser[] = (data.users ?? []).map((u: any) => ({
      id: u.id,
      username: u.username,
      name: u.name,
      email: u.email ?? null,
      primaryRole: u.primaryRole ?? u.role ?? "",
      isActive: u.isActive !== false,
    }));
    ssoUsersCache = { at: Date.now(), users };
    return users;
  } catch {
    return [];
  }
}
