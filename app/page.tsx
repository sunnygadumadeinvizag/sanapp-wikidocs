import { cookies } from "next/headers";
import { AppsMenu, PageShell, SessionGuard, UserMenu } from "iipe-common-ui";
import { prisma } from "@/lib/prisma";
import { verifyAppSession } from "@/lib/session";
import { NoticesClient, type NoticeItem } from "./components/NoticesClient";

export const dynamic = "force-dynamic";

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
  const params = await searchParams;
  const store = await cookies();
  const session = store.get("app1_session")?.value ?? "";
  const me = await verifyAppSession(session);

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
      header={{
        navItems: [
          { label: "Dashboard", href: "/", active: true },
          { label: "Notices", href: "/#notices" },
        ],
        right: (
          <>
            <AppsMenu launcherHref={`${process.env.MAIN_BASE_URL ?? "http://localhost:3001"}/my-apps`} />
            <UserMenu
              name={me.name}
              email={me.email}
              role={ROLE_LABELS[me.role] ?? me.role}
              signOutHref="/api/logout"
            >
              <a href="http://localhost:3000/account">SSO Profile</a>
              <a href={`${process.env.MAIN_BASE_URL ?? "http://localhost:3001"}/my-apps`}>My apps (Main)</a>
            </UserMenu>
          </>
        ),
      }}
      sidebarItems={[
        { label: "Dashboard", href: "/", active: true },
        { label: "SSO (identity)", href: "http://localhost:3000" },
        { label: "Main (access)", href: "http://localhost:3001" },
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
