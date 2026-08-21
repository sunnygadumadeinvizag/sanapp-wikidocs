import { cookies } from "next/headers";
import { apiPath } from "sanapp-common-ui";
import { verifyAppSession } from "@/lib/session";
import { WikiShell } from "./components/WikiShell";

export const dynamic = "force-dynamic";

function NotFoundBody({ signedIn }: { signedIn: boolean }) {
  return (
    <>
      <h1 className="iipe-page-title">404 — Page not found</h1>
      <p className="iipe-page-sub">
        The page you are looking for does not exist or may have been moved.
        {!signedIn && (
          <>
            {" "}
            <a href={apiPath("/api/start-oauth")}>Sign in</a> to see more.
          </>
        )}
      </p>
      <div className="wiki-card">
        <div className="iipe-form-actions">
          <a className="iipe-btn" href={apiPath("/")}>
            Back to Wiki Home
          </a>
        </div>
      </div>
    </>
  );
}

export default async function NotFoundPage() {
  const store = await cookies();
  const session = store.get("wikidocs_session")?.value ?? "";
  const me = await verifyAppSession(session);

  return (
    <WikiShell me={me} active="home">
      <NotFoundBody signedIn={!!me} />
    </WikiShell>
  );
}
