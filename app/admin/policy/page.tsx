import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiPath } from "sanapp-common-ui";
import { prisma } from "@/lib/prisma";
import { verifyAppSession } from "@/lib/session";
import { listSsoUsers } from "@/lib/auth";
import { WikiShell } from "../../components/WikiShell";
import { AdminPolicy } from "../../components/AdminPolicy";

export const dynamic = "force-dynamic";

export default async function AdminPolicyPage() {
  const store = await cookies();
  const session = store.get("wikidocs_session")?.value ?? "";
  const me = await verifyAppSession(session);
  if (!me) redirect(process.env.APP_BASE_URL! + "/api/start-oauth");
  const local = await prisma.appUser.findUnique({ where: { username: me.username } });
  if (local?.role !== "ADMIN") redirect(apiPath("/"));

  const ssoUsers = await listSsoUsers();
  const users = ssoUsers
    .filter((u) => u.isActive)
    .map((u) => ({ username: u.username, name: u.name, primaryRole: u.primaryRole }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <WikiShell me={me} active="home">
      <h1 className="iipe-page-title">Admin Console — Publish Policy</h1>
      <p className="iipe-page-sub">
        Decide who can create and publish documents. Every policy change is audited.
      </p>
      <AdminPolicy users={users} />
    </WikiShell>
  );
}
