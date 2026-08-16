"use client";

import { useEffect, useState } from "react";
import { apiPath } from "sanapp-common-ui";

type Entry = {
  id: string;
  actorUsername: string;
  actorName: string;
  action: string;
  targetType: string;
  targetId: string | null;
  details: Record<string, unknown> | null;
  createdAtLabel: string;
};

const ACTIONS = [
  "PUBLISH_PAGE",
  "UNPUBLISH_PAGE",
  "SAVE_VERSION",
  "CREATE_PAGE",
  "DELETE_PAGE",
  "RESTORE_VERSION",
  "CREATE_SECTION",
  "UPDATE_SECTION",
  "DELETE_SECTION",
  "POLICY_UPDATE",
  "UPLOAD",
];

export function AdminAudit() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [action, setAction] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "25" });
      if (action) params.set("action", action);
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(apiPath(`/api/audit?${params.toString()}`));
      if (!res.ok) throw new Error();
      const data = await res.json();
      setEntries(data.logs ?? []);
      setPages(data.pages ?? 1);
      setTotal(data.total ?? 0);
    } catch {
      setError("Could not load the audit log.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, action]);

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "center" }}>
        <select className="wiki-search" style={{ width: 220 }} value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}>
          <option value="">All actions</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>{a.replace(/_/g, " ")}</option>
          ))}
        </select>
        <input
          className="wiki-search"
          style={{ flex: 1, minWidth: 200 }}
          placeholder="Search actor / action…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setPage(1);
              load();
            }
          }}
        />
        <button type="button" className="iipe-btn secondary" onClick={() => { setPage(1); load(); }}>
          Apply
        </button>
      </div>

      {busy && <div className="wiki-meta">Loading…</div>}
      {!busy && entries.length === 0 && <div className="wiki-card wiki-meta">No audit entries match.</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {entries.map((e) => (
          <div key={e.id} className="wiki-card" style={{ display: "flex", gap: "0.8rem", alignItems: "flex-start", flexWrap: "wrap" }}>
            <span className="wiki-meta" style={{ minWidth: 130 }}>{e.createdAtLabel}</span>
            <span className="wiki-meta" style={{ minWidth: 130 }}>{e.actorName} (@{e.actorUsername})</span>
            <span className="wiki-badge wiki-badge-auth" style={{ minWidth: 150, textAlign: "center" }}>
              {e.action.replace(/_/g, " ")}
            </span>
            <span className="wiki-meta">{e.targetType.toLowerCase()}{e.targetId ? ` · ${e.targetId.slice(0, 8)}` : ""}</span>
            {e.details && <span className="wiki-meta" style={{ fontSize: "0.72rem" }}>{JSON.stringify(e.details)}</span>}
          </div>
        ))}
      </div>

      {pages > 1 && (
        <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", justifyContent: "center" }}>
          <button type="button" className="iipe-btn secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← Prev
          </button>
          <span className="wiki-meta">
            Page {page} of {pages} · {total} entries
          </span>
          <button type="button" className="iipe-btn secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
