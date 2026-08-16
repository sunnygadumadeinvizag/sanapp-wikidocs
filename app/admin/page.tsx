import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiPath } from "sanapp-common-ui";
import { prisma } from "@/lib/prisma";
import { verifyAppSession } from "@/lib/session";
import { WikiShell } from "../components/WikiShell";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const store = await cookies();
  const session = store.get("wikidocs_session")?.value ?? "";
  const me = await verifyAppSession(session);
  if (!me) {
    redirect(process.env.APP_BASE_URL! + "/api/start-oauth");
  }
  const local = await prisma.appUser.findUnique({ where: { username: me.username } });
  if (local?.role !== "ADMIN") {
    redirect(apiPath("/"));
  }

  const [sections, pages, versions, audits] = await Promise.all([
    prisma.wikiSection.count(),
    prisma.wikiPage.count(),
    prisma.wikiPageVersion.count(),
    prisma.auditLog.count(),
  ]);

  const cards = [
    { label: "Sections", value: sections, href: "/admin/sections" },
    { label: "Pages", value: pages, href: "/admin/sections" },
    { label: "Versions (edit history)", value: versions, href: "/admin/audit" },
    { label: "Audit entries", value: audits, href: "/admin/audit" },
  ];

  return (
    <WikiShell me={me} active="home">
      <h1 className="iipe-page-title">Admin Console</h1>
      <p className="iipe-page-sub">
        Manage the wiki tree, who may publish, and review the full audit trail.
      </p>

      <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", marginBottom: "1.5rem" }}>
        {cards.map((c) => (
          <a key={c.label} className="wiki-card" href={apiPath(c.href)}>
            <div style={{ fontSize: "1.8rem", fontWeight: 800 }}>{c.value}</div>
            <div className="wiki-meta">{c.label}</div>
          </a>
        ))}
      </div>

      <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
        <a className="wiki-card" href={apiPath("/admin/sections")}>
          <div style={{ fontWeight: 700 }}>Sections</div>
          <div className="wiki-meta">Create, rename, reorder and delete sections (pages and sub-sections cascade).</div>
        </a>
        <a className="wiki-card" href={apiPath("/admin/policy")}>
          <div style={{ fontWeight: 700 }}>Publish Policy</div>
          <div className="wiki-meta">Decide which primary roles and which users may publish documents.</div>
        </a>
        <a className="wiki-card" href={apiPath("/admin/audit")}>
          <div style={{ fontWeight: 700 }}>Audit Log</div>
          <div className="wiki-meta">Every publish, edit, upload and policy change, with who and when.</div>
        </a>
      </div>
    </WikiShell>
  );
}
