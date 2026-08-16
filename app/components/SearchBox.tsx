"use client";

import { useEffect, useRef, useState } from "react";
import { apiPath } from "sanapp-common-ui";

type Hit = {
  id: string;
  title: string;
  sectionName: string;
  sectionPath: string[];
  slug: string;
  visibility: string;
  excerpt: string;
};

export function SearchBox() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const query = q.trim();
    if (query.length < 2) {
      setHits([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(async () => {
      setBusy(true);
      try {
        const res = await fetch(apiPath(`/api/pages?q=${encodeURIComponent(query)}`));
        const data = await res.json();
        setHits(data.pages ?? []);
        setOpen(true);
      } catch {
        setHits([]);
      } finally {
        setBusy(false);
      }
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q]);

  return (
    <div style={{ position: "relative" }}>
      <input
        className="wiki-search"
        placeholder="Search the wiki… (2+ characters)"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        aria-label="Search the wiki"
      />
      {busy && <div className="wiki-meta" style={{ marginTop: 6 }}>Searching…</div>}
      {open && hits.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 6,
            background: "var(--iipe-card-bg, #fff)",
            border: "1px solid var(--iipe-border, #e5e7eb)",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            zIndex: 30,
            overflow: "hidden",
          }}
        >
          {hits.map((h) => (
            <a
              key={h.id}
              href={apiPath(`/docs/${[...h.sectionPath, h.slug].join("/")}`)}
              style={{ display: "block", padding: "0.6rem 0.9rem", textDecoration: "none", color: "inherit" }}
              onMouseDown={(e) => e.preventDefault()}
            >
              <div style={{ fontWeight: 600, fontSize: "0.92rem" }}>{h.title}</div>
              <div className="wiki-meta">
                {h.sectionName}
                {h.excerpt && <> — {h.excerpt}</>}
              </div>
            </a>
          ))}
        </div>
      )}
      {open && q.trim().length >= 2 && hits.length === 0 && !busy && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 6,
            padding: "0.6rem 0.9rem",
            background: "var(--iipe-card-bg, #fff)",
            border: "1px solid var(--iipe-border, #e5e7eb)",
            borderRadius: 10,
            fontSize: "0.85rem",
          }}
        >
          No matching pages.
        </div>
      )}
    </div>
  );
}
