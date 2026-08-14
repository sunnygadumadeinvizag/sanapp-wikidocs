import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AppsMenu, getPlatformNav, lookupAppName, PageShell, SessionGuard, UserMenu } from "sanapp-common-ui";
import { prisma } from "@/lib/prisma";
import { verifyAppSession } from "@/lib/session";
import { buildAuthorizeUrl } from "@/lib/sso";
import { NoticesClient, type NoticeItem } from "./components/NoticesClient";

export const dynamic = "force-dynamic";

const SSO_BASE_URL = process.env.SSO_BASE_URL ?? "http://localhost:3000";
const MAIN_BASE_URL = process.env.MAIN_BASE_URL ?? "http://localhost:3001";

const WRITE_ROLES = ["ADMIN", "FACULTY", "STAFF"];
const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  FACULTY: "Faculty",
  STAFF: "Staff",
  STUDENT: "Student",
  VIEWER: "Viewer",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const appName = await lookupAppName({
    mainBaseUrl: MAIN_BASE_URL,
    appKey: process.env.MAIN_API_KEY,
    basePath: process.env.BASE_PATH ?? "/app1",
    fallback: "Academic ERP",
  });
  const params = await searchParams;
  const store = await cookies();
  const session = store.get("app1_session")?.value ?? "";
  const me = await verifyAppSession(session);
  // The proxy does not run for the exact basePath root, so guard it here.
  if (!me) {
    redirect(process.env.APP_BASE_URL! + "/api/start-oauth");
  }

  if (!me) {
    return <p className="iipe-container">Session not found.</p>;
  }

  const notices = await prisma.notice.findMany({
    orderBy: { createdAt: "desc" },
    include: { author: { select: { name: true, role: true } } },
  });

  const items: NoticeItem[] = notices.map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    authorName: n.author.name,
    // Formatted once on the server so client hydration always matches.
    createdAtLabel: n.createdAt.toLocaleDateString("en-IN"),
  }));

  const canCreate = WRITE_ROLES.includes(me.role);
  const canDelete = me.role === "ADMIN";

  return (
    <PageShell
      appName={appName}
      header={{
        navItems: getPlatformNav({ mainBaseUrl: MAIN_BASE_URL, ssoBaseUrl: SSO_BASE_URL, active: "home" }),
        right: (
          <>
            <AppsMenu launcherHref={`${MAIN_BASE_URL}/my-apps`} />
            <UserMenu
              name={me.name}
              email={me.email}
              role={ROLE_LABELS[me.role] ?? me.role}
              signOutHref="/api/logout"
            >
              <a href={`${SSO_BASE_URL}/account`}>My Account</a>
              <a href={`${MAIN_BASE_URL}/my-apps`}>My Apps</a>
              {me.ssoRole === "SUPER_ADMIN" && (
                <>
                  <div className="iipe-dropdown-section">Admin Console</div>
                  <a href={`${MAIN_BASE_URL}/admin-console`}>Admin Console</a>
                </>
              )}
            </UserMenu>
          </>
        ),
      }}
      sidebarItems={[
        { label: "Home", href: "/", active: true },
        { label: "Notices", href: "/#notices" },
        { label: "My Account", href: `${SSO_BASE_URL}/account` },
        { label: "SSO (identity)", href: SSO_BASE_URL },
        { label: "Main (access)", href: MAIN_BASE_URL },
      ]}
    >
      <SessionGuard channel="iipe-app1-session" />
      <h1 className="iipe-page-title">Academic ERP</h1>
      <p className="iipe-page-sub">
        An independent application. Your identity came from the central SSO, your application
        access was confirmed by Main, and your <strong>role inside this app</strong> is managed
        here.
      </p>

      {params.error && (
        <div className="iipe-alert danger">Sign-in error: {params.error}</div>
      )}

      <div className="iipe-card">
        <div className="iipe-row">
          <div>
            <h2 style={{ margin: 0 }}>{me.name}</h2>
            <div className="iipe-muted">
              @{me.username} · {me.email}
            </div>
          </div>
          <span className="iipe-spacer" />
          <span className="iipe-badge">{ROLE_LABELS[me.role] ?? me.role}</span>
        </div>
        <p className="iipe-muted" style={{ marginBottom: 0 }}>
          Role determined by App1&apos;s own role model: Admin · Faculty · Staff · Student ·
          Viewer. {canCreate
            ? "You can publish notices."
            : `As ${ROLE_LABELS[me.role] ?? me.role}, you can read notices but not publish them.`}
        </p>
      </div>

      <div id="notices">
        <NoticesClient canCreate={canCreate} canDelete={canDelete} initialNotices={items} />
      </div>
    </PageShell>
  );
}
