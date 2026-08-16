import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { apiPath } from "sanapp-common-ui";
import { prisma } from "@/lib/prisma";
import { verifyAppSession } from "@/lib/session";
import {
  canPublish,
  canViewPage,
  currentViewer,
  getPolicy,
  resolvePath,
  sectionChain,
} from "@/lib/wiki";
import { statusLabel, visibilityLabel } from "@/lib/labels";
import { WikiShell } from "../../components/WikiShell";
import { Markdown } from "../../components/Markdown";

export const dynamic = "force-dynamic";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
const APP_BASE_URL = process.env.APP_BASE_URL ?? "";

export default async function DocsPage({
  params,
}: {
  params: Promise<{ slugs: string[] }>;
}) {
  const { slugs } = await params;
  const store = await cookies();
  const session = store.get("wikidocs_session")?.value ?? "";
  const me = await verifyAppSession(session);
  const viewer = await currentViewer();
  const policy = await getPolicy();
  const mayPublish = canPublish(viewer, policy);

  const target = await resolvePath(slugs);
  if (!target) notFound();

  const fullPath = `${BASE_PATH}/docs/${slugs.join("/")}`;

  // ---- Section index -------------------------------------------------
  if (target.kind === "section") {
    const section = await prisma.wikiSection.findUnique({
      where: { id: target.sectionId },
      include: { children: { orderBy: { sortOrder: "asc" } }, pages: true },
    });
    if (!section) notFound();
    const chain = await sectionChain(section.id);
    const visiblePages = section.pages
      .filter((p) => canViewPage(p, viewer) || (p.status === "DRAFT" && viewer?.role === "ADMIN"))
      .sort((a, b) => a.title.localeCompare(b.title));

    return (
      <WikiShell me={me} active="home">
        <Breadcrumb chain={chain} />
        <h1 className="iipe-page-title">{section.name}</h1>
        {section.description && <p className="iipe-page-sub">{section.description}</p>}

        {mayPublish && (
          <div style={{ margin: "0.75rem 0 1.25rem" }}>
            <a
              className="iipe-btn"
              href={apiPath(`/pages/new?section=${section.id}`)}
            >
              + New page in {section.name}
            </a>
          </div>
        )}

        {section.children.length > 0 && (
          <>
            <h2 style={{ fontSize: "1.1rem", margin: "1rem 0 0.5rem" }}>Sub-sections</h2>
            <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
              {section.children.map((c) => (
                <a key={c.id} className="wiki-card" href={apiPath(`/docs/${[...chain, c.slug].join("/")}`)}>
                  <div style={{ fontWeight: 700 }}>{c.name}</div>
                  {c.description && <div className="wiki-meta">{c.description}</div>}
                </a>
              ))}
            </div>
          </>
        )}

        <h2 style={{ fontSize: "1.1rem", margin: "1.25rem 0 0.5rem" }}>Pages</h2>
        {visiblePages.length === 0 ? (
          <div className="wiki-card wiki-meta">No pages here yet.</div>
        ) : (
          <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
            {visiblePages.map((p) => (
              <a
                key={p.id}
                className="wiki-card"
                href={apiPath(`/docs/${[...chain, p.slug].join("/")}`)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700 }}>{p.title}</span>
                  {p.status === "DRAFT" && <span className="wiki-badge wiki-badge-draft">draft</span>}
                </div>
                <span className={`wiki-badge ${visibilityClass(p.visibility)}`} style={{ marginTop: 6 }}>
                  {visibilityLabel(p.visibility)}
                </span>
              </a>
            ))}
          </div>
        )}
      </WikiShell>
    );
  }

  // ---- Page view ----------------------------------------------------
  const page = target.page;

  const visible = canViewPage(page, viewer);
  if (!visible) {
    // Signed-out users are sent to SSO for AUTHENTICATED pages.
    if (!me && page.visibility === "AUTHENTICATED" && page.status !== "DRAFT") {
      const ret = encodeURIComponent(fullPath);
      redirect(`${APP_BASE_URL}/api/start-oauth?returnTo=${ret}`);
    }
    // RESTRICTED / drafts: show a gate (with sign-in CTA when anonymous).
    return (
      <WikiShell me={me} active="home">
        <div className="iipe-card" style={{ maxWidth: 520, padding: "1.25rem" }}>
          <h1 style={{ fontSize: "1.2rem", margin: "0 0 0.5rem" }}>This page is restricted</h1>
          <p style={{ fontSize: "0.92rem" }}>
            {page.status === "DRAFT"
              ? "This page is a draft and has not been published yet."
              : page.visibility === "RESTRICTED"
                ? "This page is only visible to specific roles or users."
                : "You don't have permission to view this page."}
          </p>
          {!me ? (
            <a className="iipe-btn" href={apiPath("/api/start-oauth")}>
              Sign in to view
            </a>
          ) : (
            <p className="wiki-meta">
              If you believe this is a mistake, contact the App Admin.
            </p>
          )}
        </div>
      </WikiShell>
    );
  }

  const chain = await sectionChain(page.sectionId);
  const content = page.currentVersion?.content ?? "";
  const authorName = page.publishedBy?.name ?? page.createdBy?.name;

  return (
    <WikiShell me={me} active="home">
      <Breadcrumb chain={chain} />
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
        <span className={`wiki-badge ${visibilityClass(page.visibility)}`}>{visibilityLabel(page.visibility)}</span>
        {page.status === "DRAFT" && <span className="wiki-badge wiki-badge-draft">draft</span>}
        {mayPublish && (
          <span style={{ marginLeft: "auto", display: "flex", gap: "0.5rem" }}>
            <a className="iipe-btn secondary" style={{ padding: "0.35rem 0.8rem" }} href={apiPath(`/pages/${page.id}/edit`)}>
              Edit
            </a>
            <a className="iipe-btn ghost" style={{ padding: "0.35rem 0.8rem" }} href={apiPath(`/pages/${page.id}/history`)}>
              History
            </a>
          </span>
        )}
      </div>

      <Markdown content={content} />

      <div className="wiki-meta" style={{ marginTop: "1.5rem", borderTop: "1px solid var(--iipe-border, #e5e7eb)", paddingTop: "0.75rem" }}>
        {authorName && <>Last published by {authorName}</>}
        {page.publishedAt && (
          <>
            {" "}
            · {page.publishedAt.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}
          </>
        )}
        {page.status === "DRAFT" && <> · Draft (not public)</>}
      </div>
    </WikiShell>
  );
}

function visibilityClass(v: string): string {
  if (v === "PUBLIC") return "wiki-badge-public";
  if (v === "RESTRICTED") return "wiki-badge-restricted";
  return "wiki-badge-auth";
}

async function Breadcrumb({ chain }: { chain: string[] }) {
  const crumbs = [];
  let acc: string[] = [];
  for (const slug of chain) {
    acc = [...acc, slug];
    crumbs.push({ label: slug, href: `/docs/${acc.join("/")}` });
  }
  return (
    <nav className="wiki-meta" aria-label="Breadcrumb" style={{ marginBottom: "0.75rem" }}>
      <a href={apiPath("/")} style={{ textDecoration: "none" }}>Wiki Docs</a>
      {crumbs.map((c, i) => (
        <span key={i}>
          {" "}/{" "}
          <a href={apiPath(c.href)} style={{ textDecoration: "none" }}>{c.label}</a>
        </span>
      ))}
    </nav>
  );
}