import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { verifyAppSession } from "@/lib/session";
import { WikiShell } from "../components/WikiShell";
import { AppNotificationsView } from "sanapp-common-ui";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const store = await cookies();
  const session = store.get("wikidocs_session")?.value ?? "";
  const me = await verifyAppSession(session);
  if (!me) {
    redirect(process.env.APP_BASE_URL! + "/api/start-oauth");
  }

  return (
    <WikiShell me={me} active="notifications">
      <h1 className="iipe-page-title">App Notifications</h1>
      <p className="iipe-page-sub">
        Alerts from Wiki Docs. Notifications from every application also appear under the bell in
        the header.
      </p>
      <div className="mt-4">
        <AppNotificationsView appName="Wiki Docs" />
      </div>
    </WikiShell>
  );
}
