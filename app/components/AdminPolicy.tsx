"use client";

import { useEffect, useMemo, useState } from "react";
import { apiPath } from "sanapp-common-ui";
import { PRIMARY_ROLE_LABELS } from "@/lib/labels";

type UserOption = { username: string; name: string; primaryRole: string };

export function AdminPolicy({ users }: { users: UserOption[] }) {
  const [allowedRoles, setAllowedRoles] = useState<string[]>([]);
  const [allowedUsers, setAllowedUsers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(apiPath("/api/policy"));
        const data = await res.json();
        setAllowedRoles(data.policy?.allowedRoles ?? []);
        setAllowedUsers(data.policy?.allowedUsers ?? []);
      } catch {
        setError("Could not load the policy.");
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const roles = useMemo(() => Object.entries(PRIMARY_ROLE_LABELS), []);

  function toggleRole(r: string) {
    setAllowedRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  }
  function toggleUser(u: string) {
    setAllowedUsers((prev) => (prev.includes(u) ? prev.filter((x) => x !== u) : [...prev, u]));
  }

  async function save() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(apiPath("/api/policy"), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ allowedRoles, allowedUsers }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Save failed");
        return;
      }
      setMessage("Publish policy updated — every change is recorded in the audit log.");
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return <div className="wiki-meta">Loading…</div>;

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}
      {message && (
        <div className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800">{message}</div>
      )}

      <div className="iipe-card space-y-4">
        <div>
          <div className="text-sm font-medium mb-1">Primary roles that may publish</div>
          <p className="wiki-meta" style={{ marginBottom: 8 }}>
            Users with any of these SSO primary roles can create and publish documents. App Admins can always publish.
          </p>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {roles.map(([value, label]) => (
              <label key={value} style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.9rem" }}>
                <input type="checkbox" checked={allowedRoles.includes(value)} onChange={() => toggleRole(value)} />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <div className="text-sm font-medium mb-1">Specific users that may publish</div>
          <p className="wiki-meta" style={{ marginBottom: 8 }}>
            Individual users allowed to publish regardless of primary role.
          </p>
          <input
            className="wiki-search"
            placeholder="Filter users by name or username…"
            onChange={(e) => {
              const q = e.target.value.toLowerCase();
              const rows = document.querySelectorAll<HTMLLabelElement>("[data-user-row]");
              rows.forEach((r) => {
                r.style.display = r.textContent?.toLowerCase().includes(q) ? "" : "none";
              });
            }}
          />
          <div style={{ maxHeight: 300, overflowY: "auto", marginTop: 8, display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            {users.map((u) => (
              <label
                key={u.username}
                data-user-row
                style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.88rem" }}
              >
                <input type="checkbox" checked={allowedUsers.includes(u.username)} onChange={() => toggleUser(u.username)} />
                {u.name} ({u.username})
                {u.primaryRole && <span className="wiki-meta">— {u.primaryRole.replace(/_/g, " ")}</span>}
              </label>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>
          <button type="button" className="iipe-btn" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save policy"}
          </button>
          <span className="wiki-meta">
            Allowed roles: {allowedRoles.length} · Allowed users: {allowedUsers.length}
          </span>
        </div>
      </div>
    </div>
  );
}
