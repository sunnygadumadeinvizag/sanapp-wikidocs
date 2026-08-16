import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyAppSession } from "@/lib/session";
import { canPublish, currentViewer, getPolicy } from "@/lib/wiki";
import { WikiShell } from "../../../components/WikiShell";
import { PageHistory } from "../../../components/PageHistory";

export const dynamic = "force-dynamic";

export default async function HistoryPage({
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
  const mayPublish = canPublish(viewer, policy);

  const page = await prisma.wikiPage.findUnique({ where: { id } });
  if (!page) notFound();

  return (
    <WikiShell me={me} active="home">
      <h1 className="iipe-page-title">Version History</h1>
      <p className="iipe-page-sub">
        “{page.title}” — every save and publish is kept forever; nothing is overwritten.
      </p>
      <PageHistory pageId={id} canPublish={mayPublish} pageTitle={page.title} />
    </WikiShell>
  );
}
