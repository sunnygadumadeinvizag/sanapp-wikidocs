import { Logo } from "iipe-common-ui";

export default function AccessDeniedPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div className="iipe-card" style={{ width: 440, maxWidth: "100%" }}>
        <Logo showText={false} />
        <h1 style={{ margin: "14px 0 4px", fontSize: "1.3rem" }}>Access denied</h1>
        <p>
          Your identity was confirmed by the central SSO, but{" "}
          <strong>IIPE Main</strong> has not granted you access to this application.
        </p>
        <div className="iipe-alert">
          Ask an administrator to grant access in{" "}
          <a href="http://localhost:3001">IIPE Main</a>, then{" "}
          <a href="/">try again</a> — you won&apos;t need to sign in again.
        </div>
        <div className="iipe-form-actions">
          <a className="iipe-btn" href="/api/logout">
            Sign out
          </a>
        </div>
      </div>
    </div>
  );
}
