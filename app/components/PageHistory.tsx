"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPath } from "sanapp-common-ui";

type Version = {
  id: string;
  version: number;
  title: string;
  changeSummary: string | null;
  isPublished: boolean;
  authorName: string;
  createdAtLabel: string;
};

export function PageHistory({ pageId, canPublish, pageTitle }: { pageId: string; canPublish: boolean; pageTitle: string }) {
  const router = useRouter();
  const [versions, setVersions] = useState<Version[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch(apiPath(`/api/pages/${pageId}/versions`));
      const data = await res.json();
      setVersions(data.versions ?? []);
    } catch {
      setError("Could not load version history.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);

  async function restore(versionId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(apiPath(`/api/pages/${pageId}/versions`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ versionId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? "Restore failed");
        return;
      }
      router.refresh();
      load();
    } catch {
      setError("Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}
      {versions.length === 0 ? (
        <div className="wiki-card wiki-meta">No versions yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {versions.map((v, idx) => (
            <div
              key={v.id}
              className="wiki-card"
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "0.9rem",
                cursor: selected === v.id ? "pointer" : "default",
              }}
              onClick={() => setSelected(selected === v.id ? null : v.id)}
            >
              <div style={{ minWidth: 70, fontWeight: 700, fontSize: "0.9rem" }}>
                v{v.version}
                {idx === 0 && <div className="wiki-meta">current</div>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>{v.title}</div>
                <div className="wiki-meta">
                  {v.authorName} · {v.createdAtLabel}
                </div>
                {v.changeSummary && <div className="wiki-meta" style={{ marginTop: 2 }}>{v.changeSummary}</div>}
                <div style={{ marginTop: 4 }}>
                  <span className={`wiki-badge ${v.isPublished ? "wiki-badge-public" : "wiki-badge-draft"}`}>
                    {v.isPublished ? "Published" : "Draft"}
                  </span>
                </div>
                {selected === v.id && canPublish && (
                  <div style={{ marginTop: "0.6rem" }}>
                    <button
                      type="button"
                      className="iipe-btn secondary"
                      style={{ padding: "0.3rem 0.8rem", fontSize: "0.82rem" }}
                      disabled={busy}
                      onClick={(e) => {
                        e.stopPropagation();
                        restore(v.id);
                      }}
                    >
                      {busy ? "Restoring…" : "Restore as new draft"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <div>
        <a className="iipe-btn secondary" href={apiPath(`/pages/${pageId}/edit`)}>
          ← Back to editor
        </a>{" "}
        <a className="iipe-btn ghost" href={apiPath("/")}>
          Wiki home
        </a>
      </div>
    </div>
  );
}
