import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyAppSession } from "@/lib/session";
import { canPublish, currentViewer, getPolicy, listSectionsWithChain } from "@/lib/wiki";
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
  if (!me || !canPublish(viewer, policy)) {
    redirect(process.env.APP_BASE_URL! + "/api/start-oauth");
  }

  const page = await prisma.wikiPage.findUnique({
    where: { id },
    include: { currentVersion: true },
  });
  if (!page) notFound();

  const sections = await listSectionsWithChain();
  const ssoUsers = await listSsoUsers();
  const users = ssoUsers
    .filter((u) => u.isActive)
    .map((u) => ({ username: u.username, name: u.name, primaryRole: u.primaryRole }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <WikiShell me={me} active="home">
      <h1 className="iipe-page-title">Edit Page</h1>
      <p className="iipe-page-sub">
        Editing “{page.title}” — saving creates a new version; publishing replaces the public page.
      </p>
      <PageEditor
        mode="edit"
        pageId={page.id}
        sections={sections}
        users={users}
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
