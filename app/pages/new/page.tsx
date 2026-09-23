import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyAppSession } from "@/lib/session";
import { canPublishInSection, currentViewer, getPolicy, listSectionsWithChain } from "@/lib/wiki";
import { prisma } from "@/lib/prisma";
import { listSsoUsers } from "@/lib/auth";
import { WikiShell } from "../../components/WikiShell";
import { PageEditor } from "../../components/PageEditor";

export const dynamic = "force-dynamic";

export default async function NewPagePage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const store = await cookies();
  const session = store.get("wikidocs_session")?.value ?? "";
  const me = await verifyAppSession(session);
  const viewer = await currentViewer();
  const policy = await getPolicy();
  if (!me) {
    redirect(process.env.APP_BASE_URL! + "/api/start-oauth");
  }
  const { section } = await searchParams;
  const sections = await listSectionsWithChain();
  const targetSection =
    section && sections.find((s) => s.id === section)
      ? await prisma.wikiSection.findUnique({ where: { id: section } })
      : null;
  if (targetSection && !canPublishInSection(viewer, targetSection, policy)) {
    redirect(process.env.APP_BASE_URL! + "/api/start-oauth");
  }
  const ssoUsers = await listSsoUsers();
  const users = ssoUsers
    .filter((u) => u.isActive)
    .map((u) => ({ username: u.username, name: u.name, primaryRole: u.primaryRole }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const initialSection = section && sections.find((s) => s.id === section) ? section : undefined;

  return (
    <WikiShell me={me} active="home">
      <h1 className="iipe-page-title">New Page</h1>
      <p className="iipe-page-sub">
        Create a draft or publish directly. Every save keeps a version, and every publish is audited.
      </p>
      <PageEditor mode="new" sections={sections} users={users} initial={initialSection ? { sectionId: initialSection } : undefined} />
    </WikiShell>
  );
}
