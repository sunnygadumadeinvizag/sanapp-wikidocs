import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  apiPath,
  AppsMenu,
  getPlatformNav,
  lookupAppName,
  PageShell,
  SessionGuard,
  UserMenu,
} from "sanapp-common-ui";
import type { AppUserSession } from "@/lib/session";
import { verifyAppSession } from "@/lib/session";
import { centralSessionValid } from "@/lib/sso";
import { roleLabel } from "@/lib/labels";
import { buildTree, canPublish, getPolicy } from "@/lib/wiki";
import { TreeNav, type TreeNode } from "./TreeNav";

const SSO_BASE_URL = process.env.SSO_BASE_URL ?? "http://localhost:3000";
const MAIN_BASE_URL = process.env.MAIN_BASE_URL ?? "http://localhost:3001";
const APP_BASE_URL = process.env.APP_BASE_URL ?? "http://localhost:3002/wikidocs";

export async function WikiShell({
  me,
  active = "home",
  children,
}: {
  me: AppUserSession | null;
  active?: "home" | "my-apps" | "applications" | "account" | "notifications";
  children: ReactNode;
}) {
  // Silent sign-in upgrade: the wiki browses fine anonymously, but a visitor
  // who is ALREADY signed in centrally (SSO/Main/another app) should never
  // be shown a redundant "Sign in" button. If they carry a valid central
  // session and we haven't just tried, run the OAuth handshake — with an SSO
  // session present it bounces straight back signed in.
  if (!me) {
    const store = await cookies();
    // Cooldown cookie (set by /api/start-oauth) stops redirect loops when
    // the handshake fails or access was denied centrally.
    const recentlyTried = store.get("wikidocs_auto_signin")?.value;
    if (!recentlyTried) {
      const ssoSession = store.get("sso_session")?.value ?? "";
      if (ssoSession && (await centralSessionValid(ssoSession))) {
        redirect(`${APP_BASE_URL}/api/start-oauth`);
      }
    }
  }

  const viewer = me
    ? { username: me.username, role: me.role, primaryRole: me.primaryRole }
    : null;
  const policy = await getPolicy();
  const mayPublish = canPublish(viewer, policy);
  const tree: TreeNode[] = (await buildTree(viewer)) as TreeNode[];
  const ssoRole = me?.ssoRole ?? "USER";
  const isSuperAdmin = ssoRole === "SUPER_ADMIN";
  const isAppAdmin = me?.role === "ADMIN";
  const appName = await lookupAppName({
    mainBaseUrl: MAIN_BASE_URL,
    appKey: process.env.MAIN_API_KEY,
    basePath: process.env.BASE_PATH ?? "/wikidocs",
    fallback: "Wiki Docs",
  });

  const sidebarItems = [
    { label: "Wiki Home", href: apiPath("/"), active: active === "home" },
    ...(me ? [{ label: "App Notifications", href: apiPath("/notifications"), active: active === "notifications" }] : []),
    ...(mayPublish ? [{ label: "New Page", href: apiPath("/pages/new") }] : []),
    ...(isAppAdmin
      ? [
          { label: "Admin Console", heading: true, href: apiPath("/admin") },
          { label: "Sections", href: apiPath("/admin/sections") },
          { label: "Publish Policy", href: apiPath("/admin/policy") },
          { label: "Audit Log", href: apiPath("/admin/audit") },
        ]
      : []),
  ];

  return (
    <PageShell
      appName={appName}
      header={{
        signedOut: !me,
        navItems: getPlatformNav({
          mainBaseUrl: MAIN_BASE_URL,
          ssoBaseUrl: SSO_BASE_URL,
          homeLabel: "Wiki Docs",
          signedOut: !me,
          active,
        }),
        right: me ? (
          <>
            <AppsMenu launcherHref={MAIN_BASE_URL} />
            <UserMenu
              name={me.name}
              email={me.email}
              role={roleLabel(me.role)}
              signOutHref="/api/logout"
            >
              <a href={`${SSO_BASE_URL}/account`}>My Account</a>
              {isSuperAdmin && (
                <>
                  <div className="iipe-dropdown-section">Admin Console</div>
                  <a href={`${MAIN_BASE_URL}/admin-console`}>Admin Console</a>
                </>
              )}
            </UserMenu>
          </>
        ) : (
          <a className="iipe-btn" href={apiPath("/api/start-oauth")}>
            Sign in
          </a>
        ),
      }}
      // App sidebar navigation is displayed only after login AND only to users
      // who have permission to create/publish pages. Anonymous visitors and
      // read-only users do not see the app sidebar.
      sidebarItems={me && mayPublish ? sidebarItems : []}
    >
      {me && <SessionGuard channel="sanapp-wikidocs-session" />}
      {me ? (
        <div className="wiki-layout">
          <aside className="wiki-rail">
            <TreeNav tree={tree} />
          </aside>
          <main className="wiki-main">{children}</main>
        </div>
      ) : (
        <main className="wiki-main">{children}</main>
      )}
    </PageShell>
  );
}
