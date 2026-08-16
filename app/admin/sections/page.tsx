import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiPath } from "sanapp-common-ui";
import { prisma } from "@/lib/prisma";
import { verifyAppSession } from "@/lib/session";
import { WikiShell } from "../../components/WikiShell";
import { AdminSections } from "../../components/AdminSections";

export const dynamic = "force-dynamic";

export default async function AdminSectionsPage() {
  const store = await cookies();
  const session = store.get("wikidocs_session")?.value ?? "";
  const me = await verifyAppSession(session);
  if (!me) redirect(process.env.APP_BASE_URL! + "/api/start-oauth");
  const local = await prisma.appUser.findUnique({ where: { username: me.username } });
  if (local?.role !== "ADMIN") redirect(apiPath("/"));

  return (
    <WikiShell me={me} active="home">
      <h1 className="iipe-page-title">Admin Console — Sections</h1>
      <p className="iipe-page-sub">
        Build the wiki tree. Deleting a section removes its sub-sections and pages too.
      </p>
      <AdminSections />
    </WikiShell>
  );
}
