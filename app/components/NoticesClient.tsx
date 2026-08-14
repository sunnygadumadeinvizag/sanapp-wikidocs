"use client";
import { apiPath } from "sanapp-common-ui";

import { useState } from "react";

export type NoticeItem = {
  id: string;
  title: string;
  body: string;
  authorName: string;
  // Pre-formatted on the server to avoid client/server hydration mismatch.
  createdAtLabel: string;
};

export function NoticesClient({
  canCreate,
  canDelete,
  initialNotices,
}: {
  canCreate: boolean;
  canDelete: boolean;
  initialNotices: NoticeItem[];
}) {
  const [notices, setNotices] = useState<NoticeItem[]>(initialNotices);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(apiPath("/api/notices"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create notice");
      setNotices((prev) => [data.notice, ...prev]);
      setTitle("");
      setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create notice");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this notice?")) return;
    setBusy(true);
    try {
      const res = await fetch(apiPath(`/api/notices?id=${id}`), { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not delete notice");
      }
      setNotices((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete notice");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {error && <div className="iipe-alert danger">{error}</div>}

      {canCreate && (
        <form onSubmit={create} className="iipe-card">
          <h3>Publish a notice</h3>
          <div className="iipe-field">
            <label className="iipe-label" htmlFor="notice-title">Title</label>
            <input
              id="notice-title"
              className="iipe-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div className="iipe-field">
            <label className="iipe-label" htmlFor="notice-body">Body</label>
            <textarea
              id="notice-body"
              className="iipe-textarea"
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <button className="iipe-btn" type="submit" disabled={busy || !title.trim()}>
            {busy ? "Publishing…" : "Publish"}
          </button>
        </form>
      )}

      {notices.length === 0 && (
        <div className="iipe-alert">No notices yet.</div>
      )}

      {notices.map((n) => (
        <div className="iipe-card" key={n.id}>
          <div className="iipe-row">
            <h3 style={{ margin: 0 }}>{n.title}</h3>
            <span className="iipe-spacer" />
            <span className="iipe-muted">
              {n.authorName} · {n.createdAtLabel}
            </span>
            {canDelete && (
              <button
                className="iipe-btn danger"
                type="button"
                onClick={() => remove(n.id)}
                disabled={busy}
              >
                Delete
              </button>
            )}
          </div>
          <p style={{ marginBottom: 0, whiteSpace: "pre-wrap" }}>{n.body}</p>
        </div>
      ))}
    </div>
  );
}
