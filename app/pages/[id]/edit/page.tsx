import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { apiPath } from "sanapp-common-ui";
import { prisma } from "@/lib/prisma";
import { verifyAppSession } from "@/lib/session";
import { canPublishInSection, currentViewer, getPolicy, listSectionsWithChain, sectionChain } from "@/lib/wiki";
import { listSsoUsers } from "@/lib/auth";
import { WikiShell } from "../../../components/WikiShell";
import { PageEditor } from "../../../components/PageEditor";

export const dynamic = "force-dynamic";

export default async function EditPagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const store = await cookies();
  const session = store.get("wikidocs_session")?.value ?? "";
  const me = await verifyAppSession(session);
  const viewer = await currentViewer();
  const policy = await getPolicy();
  if (!me) {
    redirect(process.env.APP_BASE_URL! + "/api/start-oauth");
  }

  const page = await prisma.wikiPage.findUnique({
    where: { id },
    include: { currentVersion: true, section: true },
  });
  if (!page) notFound();
  if (!canPublishInSection(viewer, page.section, policy)) {
    redirect(process.env.APP_BASE_URL! + "/api/start-oauth");
  }

  const sections = await listSectionsWithChain();
  const chain = await sectionChain(page.sectionId);
  const ssoUsers = await listSsoUsers();
  const users = ssoUsers
    .filter((u) => u.isActive)
    .map((u) => ({ username: u.username, name: u.name, primaryRole: u.primaryRole }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const docsPath = apiPath(`/docs/${[...chain, page.slug].join("/")}`);

  return (
    <WikiShell me={me} active="home">
      <h1 className="iipe-page-title">Edit page</h1>
      <p className="iipe-page-sub">
        {chain.length > 0 && <span className="wiki-meta">{chain.join(" › ")} › </span>}
        “{page.title}” — every save keeps a version, publishing replaces what readers see.
      </p>
      <PageEditor
        mode="edit"
        pageId={page.id}
        sections={sections}
        users={users}
        status={page.status}
        version={page.currentVersion?.version ?? 0}
        updatedLabel={page.updatedAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
        liveHref={docsPath}
        historyHref={apiPath(`/pages/${page.id}/history`)}
        sectionPath={chain}
        initial={{
          title: page.title,
          slug: page.slug,
          sectionId: page.sectionId,
          visibility: page.visibility,
          allowedRoles: page.allowedRoles,
          allowedUsers: page.allowedUsers,
          content: page.currentVersion?.content ?? "",
        }}
      />
    </WikiShell>
  );
}
