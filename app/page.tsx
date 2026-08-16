import { cookies } from "next/headers";
import { apiPath } from "sanapp-common-ui";
import { verifyAppSession } from "@/lib/session";
import { buildTree, canPublish, getPolicy } from "@/lib/wiki";
import { WikiShell } from "./components/WikiShell";
import { SearchBox } from "./components/SearchBox";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const store = await cookies();
  const session = store.get("wikidocs_session")?.value ?? "";
  const me = await verifyAppSession(session);
  const viewer = me ? { username: me.username, role: me.role, primaryRole: me.primaryRole } : null;
  const policy = await getPolicy();
  const mayPublish = canPublish(viewer, policy);
  const tree = await buildTree(viewer);

  return (
    <WikiShell me={me} active="home">
      <h1 className="iipe-page-title">Wiki Docs</h1>
      <p className="iipe-page-sub">
        Institute documentation — guides, guidelines and knowledge base.
        {!me && (
          <>
            {" "}
            Some pages are public;{" "}
            <a href={apiPath("/api/start-oauth")}>sign in</a> for the rest.
          </>
        )}
      </p>

      <div style={{ margin: "1rem 0 1.5rem" }}>
        <SearchBox />
      </div>

      {tree.length === 0 ? (
        <div className="wiki-card">
          No sections yet. Ask the App Admin to create the first section.
        </div>
      ) : (
        <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
          {tree.map((s: any) => (
            <a key={s.id} className="wiki-card" href={apiPath(`/docs/${s.slug}`)}>
              <div style={{ fontWeight: 700, fontSize: "1rem" }}>{s.name}</div>
              {s.description && <div className="wiki-meta" style={{ marginTop: 4 }}>{s.description}</div>}
              <div className="wiki-meta" style={{ marginTop: 8 }}>
                {s.pages.length} page{s.pages.length === 1 ? "" : "s"}
                {s.children.length > 0 && <> · {s.children.length} sub-section{s.children.length === 1 ? "" : "s"}</>}
              </div>
            </a>
          ))}
        </div>
      )}

      {mayPublish && (
        <div style={{ marginTop: "1.5rem" }}>
          <a className="iipe-btn" href={apiPath("/pages/new")}>
            + New Page
          </a>
        </div>
      )}
    </WikiShell>
  );
}
